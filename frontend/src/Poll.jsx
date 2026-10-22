import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  batches,
  confirmed,
  explain,
  findEvent,
  getWalletLink,
  loadPoll,
  NETWORK,
  parseAddresses,
  RelayUnavailable,
  shortAddress,
  txUrl,
  voteFree,
  voteWithFee,
  writableVoting,
} from "./chain.js";
import { AddressInput } from "./CreatePoll.jsx";
import {
  CopyButton,
  ExternalLink,
  formatDate,
  formatDuration,
  plural,
  StatusLine,
  useLoader,
  useNow,
} from "./ui.jsx";

// Chart.js only loads once results are shown.
const Results = lazy(() => import("./Results.jsx"));

export default function Poll({ id, wallet, isAdmin, gasless, setGasless }) {
  const { data: poll, error, refresh } = useLoader(() => loadPoll(id, wallet.account), [id, wallet.account]);
  const now = useNow(1000);
  const live = poll ? now < poll.end : false;

  // When the countdown hits zero, fetch the final numbers.
  const wasLive = useRef(false);
  useEffect(() => {
    if (!poll) return;
    if (wasLive.current && !live) refresh();
    wasLive.current = live;
  }, [poll, live, refresh]);

  useEffect(() => {
    if (poll) document.title = `${poll.title} · Absolute Vote`;
    return () => {
      document.title = "Absolute Vote";
    };
  }, [poll?.title]);

  if (!poll) {
    const missing = error?.revert?.name === "InvalidPoll";
    if (!error) return <p className="muted">Loading poll…</p>;
    return (
      <section className="card narrow">
        <h1>{missing ? "Poll not found" : "Couldn't load this poll"}</h1>
        <p>{missing ? "There's no poll at this link. It may have a typo." : explain(error)}</p>
        {missing ? (
          <a className="button" href="#/">
            See all polls
          </a>
        ) : (
          <button type="button" className="button" onClick={refresh}>
            Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <article className="poll">
      <a href="#/" className="back">
        ← All polls
      </a>
      <header className="poll-head">
        <span className="badges">
          <span className={`badge ${live ? "live" : ""}`}>{live ? "Live" : "Ended"}</span>
          <span className="badge">{poll.restricted ? "Allowlist only" : "Open to all wallets"}</span>
        </span>
        <h1>{poll.title}</h1>
        <p className="muted">
          {live ? (
            <>
              Closes in <strong className="countdown">{formatDuration(poll.end - now)}</strong> ({formatDate(poll.end)})
            </>
          ) : (
            <>
              Ended {formatDate(poll.end)}
              {poll.endedEarly && " (closed early by the admin)"}
            </>
          )}
          {" · "}
          {plural(poll.totalVotes, "vote")}
          {poll.restricted && ` from ${plural(poll.voterCount, "eligible wallet")}`}
        </p>
        <CopyButton text={location.href} label="Copy link to share" />
      </header>

      {error && (
        <p className="banner warn" role="status">
          Couldn't refresh ({explain(error)}). Retrying automatically.
        </p>
      )}

      {live && (
        <VotePanel key={wallet.account} poll={poll} wallet={wallet} gasless={gasless} setGasless={setGasless} onVoted={refresh} />
      )}
      {(!live || isAdmin) && (
        <Suspense fallback={<p className="muted">Loading results…</p>}>
          <Results poll={poll} live={live} />
        </Suspense>
      )}
      {live && isAdmin && <AdminTools poll={poll} onChange={refresh} />}
    </article>
  );
}

function VotePanel({ poll, wallet, gasless, setGasless, onVoted }) {
  const [choice, setChoice] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);

  let blocker = null;
  if (!wallet.available) {
    const link = getWalletLink();
    blocker = (
      <>
        <p>To vote you need a crypto wallet such as MetaMask. It's free and takes a minute to set up.</p>
        <a className="button" href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      </>
    );
  } else if (!wallet.account) {
    blocker = (
      <>
        <p>Connect your wallet to vote. Your wallet address is your voter ID.</p>
        <button type="button" className="button" onClick={wallet.connect}>
          Connect wallet
        </button>
      </>
    );
  } else if (!wallet.onRightChain) {
    blocker = (
      <>
        <p>Your wallet is connected to a different network.</p>
        <button type="button" className="button" onClick={wallet.switchChain}>
          Switch to {NETWORK.name}
        </button>
      </>
    );
  } else if (poll.myVote >= 0) {
    blocker = (
      <>
        <p className="status success">
          <span aria-hidden="true">✓ </span>You voted for <strong>{poll.options[poll.myVote]}</strong>.
          {txHash && txUrl(txHash) && (
            <>
              {" "}
              <ExternalLink href={txUrl(txHash)}>View transaction</ExternalLink>
            </>
          )}
        </p>
        <p className="muted">Results appear here when voting closes.</p>
      </>
    );
  } else if (poll.restricted && !poll.eligible) {
    blocker = (
      <>
        <p>
          This poll is limited to an allowlist, and your wallet ({shortAddress(wallet.account)}) isn't on it. Send
          your address to the poll admin to be added.
        </p>
        <CopyButton text={wallet.account} label="Copy my address" />
      </>
    );
  }
  if (blocker) {
    return (
      <section className="card" aria-labelledby="vote-title">
        <h2 id="vote-title">Your vote</h2>
        {blocker}
      </section>
    );
  }

  async function submit() {
    setBusy(true);
    setConfirming(false);
    const free = gasless;
    try {
      setStatus({
        kind: "info",
        text: free ? "Sign your vote in MetaMask. It's free: no fee, no transaction." : "Confirm the transaction in MetaMask.",
      });
      const hash = free ? await voteFree(poll.id, choice) : await voteWithFee(poll.id, choice);
      setTxHash(hash);
      setStatus({ kind: "info", text: "Recording your vote on the blockchain…", hash });
      await confirmed(hash);
      setStatus({ kind: "success", text: "Your vote was recorded.", hash });
      await onVoted();
    } catch (error) {
      // If free voting is down, fall back to the voter paying the fee on their next try.
      const relayDown = error instanceof RelayUnavailable;
      if (relayDown) setGasless(false);
      setStatus({
        kind: "error",
        text: relayDown
          ? `${error.message} You can still vote by paying a small network fee: press “Cast vote” again.`
          : explain(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="vote-title">
      <h2 id="vote-title">Cast your vote</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (choice !== null) setConfirming(true);
        }}
      >
        <fieldset className="options" disabled={busy}>
          <legend>Choose one option</legend>
          {poll.options.map((label, i) => (
            <label key={label + i} className={`option ${choice === i ? "selected" : ""}`}>
              <input
                type="radio"
                name="option"
                checked={choice === i}
                onChange={() => {
                  setChoice(i);
                  setConfirming(false);
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {confirming ? (
          <div className="confirm">
            <p>
              Vote for <strong>{poll.options[choice]}</strong>? Votes are final and public on the blockchain.
              {gasless ? " Voting is free." : " Your wallet pays a small network fee."}
            </p>
            <div className="actions">
              {/* biome-ignore lint/a11y/noAutofocus: moves focus to the step the user just asked for */}
              <button type="button" className="button" onClick={submit} autoFocus>
                Confirm vote
              </button>
              <button type="button" className="button ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="submit" className="button" disabled={choice === null || busy}>
              {busy ? "Voting…" : "Cast vote"}
            </button>
          </div>
        )}
        <p className="hint">
          {gasless ? (
            "Free: you'll only sign a message in MetaMask."
          ) : (
            <>
              You'll pay a small network fee in {NETWORK.name} test ETH.{" "}
              {NETWORK.faucet && <ExternalLink href={NETWORK.faucet}>Get free test ETH</ExternalLink>}
            </>
          )}
        </p>
      </form>
      <StatusLine status={status} />
    </section>
  );
}

function AdminTools({ poll, onChange }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const parsed = parseAddresses(text);

  async function run(action) {
    setBusy(true);
    try {
      await action();
      await onChange();
    } catch (error) {
      setStatus({ kind: "error", text: explain(error) });
    } finally {
      setBusy(false);
    }
  }

  const addVoters = () =>
    run(async () => {
      const groups = batches(parsed.addresses);
      const contract = await writableVoting();
      let added = 0;
      for (const [i, group] of groups.entries()) {
        const step = groups.length > 1 ? ` (batch ${i + 1} of ${groups.length})` : "";
        setStatus({ kind: "info", text: `Confirm adding voters${step} in MetaMask.` });
        const tx = await contract.addVoters(poll.id, group);
        setStatus({ kind: "info", text: `Adding voters${step}…`, hash: tx.hash });
        added += Number(findEvent(await confirmed(tx.hash), "VotersAdded")?.added ?? 0);
      }
      setText("");
      const skipped = parsed.addresses.length - added;
      setStatus({
        kind: "success",
        text: `Added ${plural(added, "wallet")} to the allowlist.${skipped ? ` ${plural(skipped, "wallet")} were already on it.` : ""}`,
      });
    });

  const endPoll = () =>
    run(async () => {
      setConfirmEnd(false);
      setStatus({ kind: "info", text: "Confirm closing the poll in MetaMask." });
      const tx = await (await writableVoting()).endPoll(poll.id);
      setStatus({ kind: "info", text: "Closing the poll…", hash: tx.hash });
      await confirmed(tx.hash);
      setStatus({ kind: "success", text: "The poll is closed and the results are now public." });
    });

  return (
    <section className="card admin" aria-labelledby="admin-title">
      <h2 id="admin-title">Admin tools</h2>

      {poll.restricted && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed.addresses.length && !parsed.invalid.length) addVoters();
          }}
        >
          <h3>Add voters to the allowlist</h3>
          <AddressInput id="add-voters" value={text} onChange={setText} parsed={parsed} />
          <div className="actions">
            <button
              type="submit"
              className="button"
              disabled={busy || !parsed.addresses.length || parsed.invalid.length > 0}
            >
              Add {parsed.addresses.length ? plural(parsed.addresses.length, "wallet") : "wallets"}
            </button>
          </div>
        </form>
      )}

      <div className="stack">
        <h3>End voting now</h3>
        {confirmEnd ? (
          <div className="confirm">
            <p>Close this poll now? Nobody will be able to vote, and the results become final.</p>
            <div className="actions">
              <button type="button" className="button danger" onClick={endPoll} disabled={busy}>
                Yes, end the poll
              </button>
              <button type="button" className="button ghost" onClick={() => setConfirmEnd(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="button ghost" onClick={() => setConfirmEnd(true)} disabled={busy}>
              End poll early
            </button>
          </div>
        )}
      </div>
      <StatusLine status={status} />
    </section>
  );
}

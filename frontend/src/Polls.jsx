import { explain, getWalletLink, loadPolls, NETWORK } from "./chain.js";
import { ExternalLink, formatDate, formatDuration, plural, useLoader, useNow } from "./ui.jsx";

export default function Polls({ wallet, isAdmin, gasless }) {
  const { data: polls, error, refresh } = useLoader(() => loadPolls(wallet.account), [wallet.account]);
  const now = useNow(1000);

  if (!polls) {
    if (!error) return <p className="muted">Loading polls…</p>;
    return (
      <section className="card narrow">
        <h1>Couldn't load polls</h1>
        <p>{explain(error)}</p>
        <button type="button" className="button" onClick={refresh}>
          Try again
        </button>
      </section>
    );
  }

  const live = polls.filter((p) => p.end > now);
  const ended = polls.filter((p) => p.end <= now);

  return (
    <>
      <Intro wallet={wallet} gasless={gasless} />
      {error && (
        <p className="banner warn" role="status">
          Couldn't refresh ({explain(error)}). Showing the last data; retrying automatically.
        </p>
      )}

      <div className="section-head">
        <h1>Live polls</h1>
        {isAdmin && (
          <a className="button" href="#/new">
            Create a poll
          </a>
        )}
      </div>
      {live.length > 0 ? (
        <ul className="poll-grid">
          {live.map((poll) => (
            <PollCard key={poll.id} poll={poll} now={now} account={wallet.account} />
          ))}
        </ul>
      ) : (
        <p className="empty">
          {polls.length === 0
            ? isAdmin
              ? "No polls yet. Create the first one!"
              : "No polls yet. Polls created by the admin will appear here."
            : "No polls are open right now."}
        </p>
      )}

      {ended.length > 0 && (
        <>
          <h2 className="section-title">Ended polls</h2>
          <ul className="poll-grid">
            {ended.map((poll) => (
              <PollCard key={poll.id} poll={poll} now={now} account={wallet.account} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Intro({ wallet, gasless }) {
  const link = getWalletLink();
  return (
    <details className="card intro" open={!wallet.account}>
      <summary>How voting works</summary>
      <ol>
        <li>
          <strong>Get a wallet.</strong> Your crypto wallet is your voter ID, so there's nothing to sign up for.{" "}
          {!wallet.available && <ExternalLink href={link.href}>{link.label}</ExternalLink>}
        </li>
        <li>
          <strong>Connect it</strong> with the button at the top and approve in MetaMask.
        </li>
        <li>
          <strong>Vote.</strong> Pick an option and confirm.{" "}
          {gasless ? "It's free: you only sign a message." : "You pay a tiny network fee in test ETH."} Each wallet
          votes once per poll and votes can't be changed.
        </li>
        <li>
          <strong>See the results</strong> when the poll closes. Anyone can check them on the blockchain.
        </li>
      </ol>
      {NETWORK.explorer && (
        <p className="muted">This app runs on the {NETWORK.name} test network, so no real money is involved.</p>
      )}
    </details>
  );
}

function PollCard({ poll, now, account }) {
  const live = poll.end > now;
  let you = null;
  if (account) {
    if (poll.myVote >= 0) you = { text: "✓ You voted", kind: "done" };
    else if (!live) you = { text: "You didn't vote", kind: "" };
    else if (poll.restricted && !poll.eligible) you = { text: "You're not on the allowlist", kind: "" };
    else you = { text: "You can vote", kind: "todo" };
  }
  return (
    <li>
      <a className="card poll-card" href={`#/poll/${poll.id}`}>
        <span className="badges">
          <span className={`badge ${live ? "live" : ""}`}>{live ? "Live" : "Ended"}</span>
          <span className="badge">{poll.restricted ? "Allowlist" : "Open to all"}</span>
        </span>
        <span className="poll-card-title">{poll.title}</span>
        <span className="muted">
          {live ? `Closes in ${formatDuration(poll.end - now)}` : `Ended ${formatDate(poll.end)}`} ·{" "}
          {plural(poll.totalVotes, "vote")}
        </span>
        {you && <span className={`you ${you.kind}`}>{you.text}</span>}
      </a>
    </li>
  );
}

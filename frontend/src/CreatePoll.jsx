import { useState } from "react";
import {
  batches,
  confirmed,
  explain,
  findEvent,
  getWalletLink,
  NETWORK,
  parseAddresses,
  shortAddress,
  VOTER_BATCH,
  writableVoting,
} from "./chain.js";
import { StatusLine } from "./ui.jsx";

const MAX_OPTIONS = 20;
const UNITS = { minutes: 60, hours: 3600, days: 86400 };
const clip = (text) => (text.length > 16 ? `${text.slice(0, 14)}…` : text);

/** Textarea for pasting wallet addresses, with a live summary of what was understood. */
export function AddressInput({ id, value, onChange, parsed, error }) {
  const { addresses, invalid, duplicates } = parsed;
  const summary = value.trim()
    ? [
        `${addresses.length} valid address${addresses.length === 1 ? "" : "es"}`,
        duplicates > 0 && `${duplicates} duplicate${duplicates === 1 ? "" : "s"} ignored`,
        invalid.length > 0 &&
          `${invalid.length} not valid (${invalid.slice(0, 3).map(clip).join(", ")}${invalid.length > 3 ? ", …" : ""}): check for typos`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Paste wallet addresses (0x…), one per line. Commas or spaces work too.";
  const problem = Boolean(error) || invalid.length > 0;
  return (
    <div className="field">
      <label htmlFor={id}>Wallet addresses</label>
      <textarea
        id={id}
        rows={5}
        value={value}
        spellCheck={false}
        autoComplete="off"
        placeholder={"0x1234…\n0xabcd…"}
        aria-invalid={problem || undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={`${id}-hint`} className={problem ? "field-error" : "hint"}>
        {error && `${error} `}
        {summary}
      </p>
    </div>
  );
}

/** Returns field errors plus the indexes of option inputs to highlight. */
function validate({ title, options, amount, unit, allowlist, parsed }) {
  const errors = {};
  if (!title.trim()) errors.title = "Give the poll a title.";
  const cleaned = options.map((o) => o.trim().toLowerCase());
  const badOptions = new Set(cleaned.flatMap((o, i) => (!o || cleaned.indexOf(o) !== i || cleaned.lastIndexOf(o) !== i ? [i] : [])));
  if (cleaned.filter(Boolean).length < 2) errors.options = "Add at least two options.";
  else if (cleaned.some((o) => !o)) errors.options = "Fill in or remove the empty option.";
  else if (badOptions.size) errors.options = "Each option must be different.";
  const count = Number(amount);
  if (!Number.isInteger(count) || count < 1) errors.duration = "Enter a whole number, 1 or more.";
  else if (count * UNITS[unit] > 365 * UNITS.days) errors.duration = "A poll can run for at most 365 days.";
  if (allowlist) {
    if (parsed.invalid.length) errors.voters = "Fix or remove the addresses that aren't valid.";
    else if (!parsed.addresses.length) errors.voters = "Add at least one wallet address (you can add more later).";
  }
  return { errors, badOptions };
}

export default function CreatePoll({ wallet, isAdmin, admin }) {
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("days");
  const [allowlist, setAllowlist] = useState(false);
  const [voterText, setVoterText] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [createdId, setCreatedId] = useState(null);

  if (!wallet.account || !wallet.onRightChain || !isAdmin) {
    const link = getWalletLink();
    return (
      <section className="card narrow">
        <h1>Create a poll</h1>
        {!wallet.available ? (
          <>
            <p>Creating polls needs the admin's MetaMask wallet.</p>
            <a className="button" href={link.href} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          </>
        ) : !wallet.account ? (
          <>
            <p>Connect the admin wallet to create polls.</p>
            <button type="button" className="button" onClick={wallet.connect}>
              Connect wallet
            </button>
          </>
        ) : !wallet.onRightChain ? (
          <>
            <p>Your wallet is connected to a different network.</p>
            <button type="button" className="button" onClick={wallet.switchChain}>
              Switch to {NETWORK.name}
            </button>
          </>
        ) : (
          <p>
            Only the admin wallet ({admin ? shortAddress(admin) : "the one that deployed the contract"}) can create
            polls. Switch to that account in MetaMask.
          </p>
        )}
      </section>
    );
  }

  const parsed = parseAddresses(voterText);
  const { errors, badOptions } = validate({ title, options, amount, unit, allowlist, parsed });
  const visible = showErrors ? errors : {};
  const cleanedOptions = options.map((o) => o.trim());
  const seconds = Number(amount) * UNITS[unit];
  const voterGroups = allowlist ? batches(parsed.addresses) : [];
  const unitLabel = amount === "1" ? unit.slice(0, -1) : unit;

  function setOption(i, value) {
    setOptions(options.map((o, j) => (j === i ? value : o)));
    setConfirming(false);
  }

  function review(e) {
    e.preventDefault();
    if (Object.keys(errors).length) {
      setShowErrors(true);
      // Move focus to the first field that needs attention once it's marked invalid.
      requestAnimationFrame(() => document.querySelector("form [aria-invalid='true']")?.focus());
      return;
    }
    setConfirming(true);
  }

  async function create() {
    setConfirming(false);
    setBusy(true);
    let pollId = null;
    try {
      const contract = await writableVoting();
      setStatus({ kind: "info", text: "Confirm the new poll in MetaMask." });
      const tx = await contract.createPoll(title.trim(), cleanedOptions, seconds, allowlist, voterGroups[0] ?? []);
      setStatus({ kind: "info", text: "Creating the poll…", hash: tx.hash });
      pollId = Number(findEvent(await confirmed(tx.hash), "PollCreated").pollId);
      for (let i = 1; i < voterGroups.length; i++) {
        const step = `batch ${i + 1} of ${voterGroups.length}`;
        setStatus({ kind: "info", text: `Poll created. Confirm adding voters (${step}) in MetaMask.` });
        const batchTx = await contract.addVoters(pollId, voterGroups[i]);
        setStatus({ kind: "info", text: `Adding voters (${step})…`, hash: batchTx.hash });
        await confirmed(batchTx.hash);
      }
      location.hash = `#/poll/${pollId}`;
    } catch (error) {
      setCreatedId(pollId);
      setStatus({
        kind: "error",
        text:
          pollId === null
            ? explain(error)
            : `The poll was created, but not every voter was added (${explain(error)}). Add the rest from the poll page.`,
      });
      setBusy(false);
    }
  }

  return (
    <section className="card create">
      <h1>Create a poll</h1>
      <p className="muted">The poll opens as soon as it's created and can't be edited afterwards.</p>
      <form onSubmit={review} noValidate>
        <fieldset className="stack" disabled={busy}>
          <div className="field">
            <label htmlFor="title">Question or title</label>
            <input
              id="title"
              value={title}
              maxLength={120}
              placeholder="e.g. Where should we hold the team offsite?"
              aria-invalid={Boolean(visible.title) || undefined}
              aria-describedby={visible.title ? "title-error" : undefined}
              onChange={(e) => {
                setTitle(e.target.value);
                setConfirming(false);
              }}
            />
            {visible.title && (
              <p id="title-error" className="field-error">
                {visible.title}
              </p>
            )}
          </div>

          <fieldset className="field">
            <legend>Options</legend>
            <ol className="option-inputs">
              {options.map((option, i) => (
                <li key={i}>
                  <input
                    value={option}
                    maxLength={80}
                    aria-label={`Option ${i + 1}`}
                    placeholder={`Option ${i + 1}`}
                    aria-invalid={(visible.options && badOptions.has(i)) || undefined}
                    aria-describedby={visible.options ? "options-error" : undefined}
                    onChange={(e) => setOption(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="button ghost small"
                    aria-label={`Remove option ${i + 1}`}
                    disabled={options.length <= 2}
                    onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="button ghost small"
              disabled={options.length >= MAX_OPTIONS}
              onClick={() => setOptions([...options, ""])}
            >
              + Add option
            </button>
            <p id="options-error" className={visible.options ? "field-error" : "hint"}>
              {visible.options || `2 to ${MAX_OPTIONS} options.`}
            </p>
          </fieldset>

          <fieldset className="field">
            <legend>How long voting stays open</legend>
            <div className="row">
              <input
                id="duration"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                aria-label="Duration"
                aria-invalid={Boolean(visible.duration) || undefined}
                aria-describedby="duration-hint"
                onChange={(e) => setAmount(e.target.value)}
              />
              <select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <p id="duration-hint" className={visible.duration ? "field-error" : "hint"}>
              {visible.duration || "From 1 minute up to 365 days. You can also end a poll early."}
            </p>
          </fieldset>

          <fieldset className="field">
            <legend>Who can vote</legend>
            <label className="option">
              <input type="radio" name="access" checked={!allowlist} onChange={() => setAllowlist(false)} />
              <span>
                <strong>Anyone with a wallet</strong>
                <span className="hint block">
                  Easiest to share. One vote per wallet, but someone with several wallets could vote several times.
                </span>
              </span>
            </label>
            <label className="option">
              <input type="radio" name="access" checked={allowlist} onChange={() => setAllowlist(true)} />
              <span>
                <strong>Only wallets I list</strong>
                <span className="hint block">Best for real elections: only the addresses you add can vote.</span>
              </span>
            </label>
          </fieldset>

          {allowlist && (
            <AddressInput
              id="voters"
              value={voterText}
              onChange={(value) => {
                setVoterText(value);
                setConfirming(false);
              }}
              parsed={parsed}
              error={visible.voters}
            />
          )}
        </fieldset>

        {confirming ? (
          <div className="confirm">
            <p>
              Create <strong>“{title.trim()}”</strong> with {cleanedOptions.length} options, open for {amount}{" "}
              {unitLabel}, {allowlist ? `limited to ${parsed.addresses.length} listed wallets` : "open to any wallet"}?
              Your wallet pays a small network fee
              {voterGroups.length > 1 &&
                ` (${voterGroups.length} transactions, one per ${VOTER_BATCH} voters)`}
              .
            </p>
            <div className="actions">
              {/* biome-ignore lint/a11y/noAutofocus: moves focus to the step the user just asked for */}
              <button type="button" className="button" onClick={create} autoFocus>
                Create poll
              </button>
              <button type="button" className="button ghost" onClick={() => setConfirming(false)}>
                Back to editing
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Creating…" : "Review and create"}
            </button>
            <a className="button ghost" href="#/">
              Cancel
            </a>
          </div>
        )}
      </form>
      <StatusLine status={status} />
      {createdId !== null && (
        <p>
          <a href={`#/poll/${createdId}`}>Open the new poll</a>
        </p>
      )}
    </section>
  );
}

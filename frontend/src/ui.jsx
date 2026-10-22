// Small hooks and components shared by the pages.
import { useCallback, useEffect, useRef, useState } from "react";
import { txUrl } from "./chain.js";

export function useRoute() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
      document.getElementById("main")?.focus({ preventScroll: true }); // tell screen readers the page changed
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const poll = hash.match(/^#\/poll\/(\d+)$/);
  if (poll) return { page: "poll", id: Number(poll[1]) };
  return { page: hash === "#/new" ? "new" : "home" };
}

/** Loads data now, every 15 s while the tab is visible, and on `refresh()`. Keeps the last
 *  good data on errors (no flashing), drops it when `deps` change (e.g. another wallet, whose
 *  vote status differs), and ignores responses that arrive out of order. */
export function useLoader(load, deps, intervalMs = 15_000) {
  const [state, setState] = useState({ data: undefined, error: null });
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    const run = ++latest.current;
    try {
      const data = await loadRef.current();
      if (run === latest.current) setState({ data, error: null });
    } catch (error) {
      if (run === latest.current) setState((s) => ({ data: s.data, error }));
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: callers pass the deps that change `load`
  useEffect(() => {
    setState({ data: undefined, error: null });
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, deps);

  return { ...state, refresh };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const [d, h, m, sec] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export const formatDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export function ExternalLink({ href, children }) {
  if (!href) return children;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** One live region per action area, so progress and errors are announced to screen readers. */
export function StatusLine({ status }) {
  return (
    <div className="status-line" role="status" aria-live="polite">
      {status && (
        <p className={`status ${status.kind}`}>
          {status.kind === "success" && <span aria-hidden="true">✓ </span>}
          {status.text}
          {status.hash && txUrl(status.hash) && (
            <>
              {" "}
              <ExternalLink href={txUrl(status.hash)}>View transaction</ExternalLink>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this:", text); // clipboard API is blocked on plain http
    }
  }
  return (
    <button type="button" className="button ghost small" onClick={copy}>
      {copied ? "Copied ✓" : label}
      <span className="sr-only" aria-live="polite">
        {copied ? " copied to clipboard" : ""}
      </span>
    </button>
  );
}

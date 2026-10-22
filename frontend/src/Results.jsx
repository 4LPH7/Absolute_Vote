import { ArcElement, Chart, DoughnutController, Tooltip } from "chart.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { addressUrl, CONTRACT_ADDRESS, NETWORK } from "./chain.js";
import { ExternalLink, formatDate, formatDuration, plural } from "./ui.jsx";

Chart.register(DoughnutController, ArcElement, Tooltip);

// Categorical slots in fixed order, validated (scripts/validate_palette.js) for colour-blind
// separation in both modes, including the ring's wrap-around pair. Polls with more than six
// options keep their top four slices and fold the rest into a gray "Other".
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"],
};
const OTHER = "#898781";
const SURFACE = { light: "#fcfcfb", dark: "#1a1a19" };
const INK = { light: ["#0b0b0b", "#52514e"], dark: ["#f0efec", "#c3c2b7"] };
const MAX_SLICES = 6;
const KEEP_WHEN_FOLDING = 4;

const percent = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });

function useColorMode() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const onChange = (e) => setDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}

/** Ranks options (ties share a rank) and works out the headline numbers. */
export function analyze(poll) {
  const total = poll.totalVotes;
  const rows = poll.options.map((label, i) => ({ i, label, votes: poll.votes[i], share: total ? poll.votes[i] / total : 0 }));
  const ranked = [...rows].sort((a, b) => b.votes - a.votes || a.i - b.i);
  for (const row of ranked) row.rank = 1 + rows.filter((r) => r.votes > row.votes).length;
  const leaders = total ? ranked.filter((r) => r.rank === 1) : [];
  const runnerUp = ranked.find((r) => r.rank > 1);
  return { total, rows, ranked, leaders, runnerUp };
}

/** Color per option index (gray = folded into "Other") and the donut's slices. */
function slicesFor(rows, ranked, palette) {
  if (rows.length <= MAX_SLICES) {
    const colors = rows.map((r) => palette[r.i]);
    return { colors, slices: rows.map((r) => ({ label: r.label, votes: r.votes, color: colors[r.i] })) };
  }
  const keep = new Set(ranked.slice(0, KEEP_WHEN_FOLDING).map((r) => r.i));
  const colors = rows.map(() => OTHER);
  const slices = rows
    .filter((r) => keep.has(r.i))
    .map((r, n) => {
      colors[r.i] = palette[n];
      return { label: r.label, votes: r.votes, color: palette[n] };
    });
  const rest = rows.filter((r) => !keep.has(r.i));
  slices.push({ label: `Other (${rest.length} options)`, votes: rest.reduce((sum, r) => sum + r.votes, 0), color: OTHER });
  return { colors, slices };
}

function Donut({ slices, total, mode }) {
  const canvas = useRef(null);
  const shown = slices.filter((s) => s.votes > 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `shown` is derived from `slices`
  useEffect(() => {
    const [ink, inkSoft] = INK[mode];
    const chart = new Chart(canvas.current, {
      type: "doughnut",
      data: {
        labels: shown.map((s) => s.label),
        datasets: [
          {
            data: shown.map((s) => s.votes),
            backgroundColor: shown.map((s) => s.color),
            borderColor: SURFACE[mode], // 2px gap in the surface color between slices
            borderWidth: shown.length > 1 ? 2 : 0, // a lone full ring needs no seam
            hoverOffset: 6,
          },
        ],
      },
      options: {
        cutout: "64%",
        layout: { padding: 8 },
        animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 500 },
        plugins: {
          legend: { display: false }, // the table next to the chart is the legend
          tooltip: {
            backgroundColor: SURFACE[mode],
            titleColor: ink,
            bodyColor: inkSoft,
            borderColor: mode === "dark" ? "rgba(255,255,255,0.14)" : "rgba(11,11,11,0.14)",
            borderWidth: 1,
            padding: 10,
            boxWidth: 10,
            boxHeight: 10,
            callbacks: {
              title: ([item]) => `${plural(item.raw, "vote")} · ${percent.format(item.raw / total)}`,
              label: (item) => ` ${item.label}`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [slices, total, mode]);

  const description = shown.map((s) => `${s.label} ${percent.format(s.votes / total)}`).join(", ");
  return (
    <div className="donut">
      <canvas ref={canvas} role="img" aria-label={`Donut chart of vote share: ${description}.`} />
      <div className="donut-center" aria-hidden="true">
        <strong>{total.toLocaleString()}</strong>
        <span>{total === 1 ? "vote" : "votes"}</span>
      </div>
    </div>
  );
}

export default function Results({ poll, live }) {
  const mode = useColorMode();
  const votesKey = poll.votes.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute only when the numbers change
  const stats = useMemo(() => analyze(poll), [votesKey, poll.options.length]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: same
  const { colors, slices } = useMemo(() => slicesFor(stats.rows, stats.ranked, SERIES[mode]), [stats, mode]);
  const { total, ranked, leaders, runnerUp } = stats;

  let headline;
  if (!total) headline = live ? "No votes yet." : "No votes were cast.";
  else if (leaders.length === 1) {
    const [leader] = leaders;
    headline = (
      <>
        {live ? "Leading" : "Winner"}: <strong>{leader.label}</strong> with {plural(leader.votes, "vote")} (
        {percent.format(leader.share)})
      </>
    );
  } else {
    headline = (
      <>
        {live ? "Currently tied" : "It's a tie"} between <strong>{leaders.map((l) => l.label).join(" and ")}</strong>{" "}
        with {plural(leaders[0].votes, "vote")} each
      </>
    );
  }

  const tiedSecond = runnerUp ? ranked.filter((r) => r.rank === runnerUp.rank).length : 0;
  const margin = leaders.length === 1 && runnerUp && (
    <>
      {plural(leaders[0].votes - runnerUp.votes, "vote")} ({((leaders[0].share - runnerUp.share) * 100).toFixed(1)}{" "}
      percentage points) ahead of {tiedSecond > 1 ? "second place" : runnerUp.label}
    </>
  );

  return (
    <section className="card results" aria-labelledby="results-title">
      <h2 id="results-title">{live ? "Live results" : "Results"}</h2>
      {live && <p className="hint">Admin view. Voters see the results here once voting closes.</p>}
      <p className="headline">
        {leaders.length === 1 && !live && <span aria-hidden="true">🏆 </span>}
        {headline}
      </p>

      {total > 0 && (
        <div className="results-grid">
          <Donut slices={slices} total={total} mode={mode} />
          <table className="results-table">
            <caption className="sr-only">Votes per option, most votes first</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Option</th>
                <th scope="col" className="num">
                  Votes
                </th>
                <th scope="col" className="num">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
                <tr key={row.i} className={row.rank === 1 ? "leader" : undefined}>
                  <td className="num">{row.rank}</td>
                  <th scope="row">
                    <span className="swatch" style={{ background: colors[row.i] }} aria-hidden="true" />
                    {row.label}
                    {row.i === poll.myVote && <span className="badge mine">Your vote</span>}
                  </th>
                  <td className="num">{row.votes.toLocaleString()}</td>
                  <td className="num">
                    <span className="share">
                      <span className="bar" aria-hidden="true">
                        <span style={{ width: `${row.share * 100}%`, background: colors[row.i] }} />
                      </span>
                      <span className="pct">{percent.format(row.share)}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="stats">
        <div>
          <dt>Total votes</dt>
          <dd>{total.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Turnout</dt>
          <dd>
            {poll.restricted
              ? `${total.toLocaleString()} of ${plural(poll.voterCount, "eligible wallet")} (${percent.format(poll.voterCount ? total / poll.voterCount : 0)})`
              : "Open poll: any wallet could vote"}
          </dd>
        </div>
        {margin && (
          <div>
            <dt>{live ? "Lead" : "Winning margin"}</dt>
            <dd>{margin}</dd>
          </div>
        )}
        <div>
          <dt>Voting opened</dt>
          <dd>{formatDate(poll.start)}</dd>
        </div>
        <div>
          <dt>{live ? "Closes" : "Voting closed"}</dt>
          <dd>
            {formatDate(poll.end)}
            {poll.endedEarly && " (ended early by the admin)"}
          </dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{formatDuration(poll.end - poll.start)}</dd>
        </div>
      </dl>

      <p className="verify">
        Every vote is a public record on the {NETWORK.name} blockchain, so these numbers can be checked
        independently.{" "}
        {NETWORK.explorer && (
          <ExternalLink href={`${addressUrl(CONTRACT_ADDRESS)}#events`}>Verify on Etherscan</ExternalLink>
        )}
      </p>
    </section>
  );
}

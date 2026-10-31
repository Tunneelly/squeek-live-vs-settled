"use client";

import { useEffect, useState } from "react";
import { buildView, fmtInt, fmtUnits, getJson, type View } from "../../lib/squeek";

type Loaded = { view: View; fetchedAt: number; missing: string[] };
type Dot = "ok" | "wait" | "na";

function ago(iso: string | null, now: number): string {
  if (!iso) return "at an unknown time";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "at an unknown time";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function hourLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Dashboard() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let controller = new AbortController();

    async function load() {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;

      const results = await Promise.allSettled([
        getJson("/status", signal),
        getJson("/settlements?range=24h", signal),
        getJson("/economy/state", signal),
      ]);
      if (cancelled || signal.aborted) return;

      const names = ["status", "settlements", "economy"];
      const missing: string[] = [];
      const bodies = results.map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        missing.push(names[i]);
        return null;
      });

      if (bodies.every((b) => b === null)) {
        setError("Couldn't reach the Squeekchain API.");
        return;
      }
      setError(null);
      setLoaded({
        view: buildView(bodies[0], bodies[1], bodies[2]),
        fetchedAt: Date.now(),
        missing,
      });
      setNow(Date.now());
    }

    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  if (!loaded) {
    return (
      <section className="card" style={{ marginTop: 16 }}>
        <div className="tag">{error ? "Offline" : "Loading"}</div>
        <p className="muted">{error ?? "Fetching live data from the Squeekchain API..."}</p>
      </section>
    );
  }

  const v = loaded.view;
  const dataStale = now - loaded.fetchedAt > 180_000;
  const obsMs = v.observedAt ? Date.parse(v.observedAt) : NaN;
  const liveStale =
    (v.freshness !== null && v.freshness !== "online") ||
    (v.staleAfter !== null && !Number.isNaN(obsMs) && (now - obsMs) / 1000 > v.staleAfter);

  const gap =
    v.liveWork !== null && v.settledWork !== null && v.liveWork >= v.settledWork
      ? v.liveWork - v.settledWork
      : null;
  const roundsOpen =
    v.closedRound !== null && v.settledRound !== null && v.closedRound >= v.settledRound
      ? v.closedRound - v.settledRound
      : null;

  const pct = v.blockProgress !== null ? Number(v.blockProgress) / 1e9 : null;
  const capPct =
    v.totalMinted !== null && v.cap !== null && v.cap > BigInt(0)
      ? Number((v.totalMinted * BigInt(10000)) / v.cap) / 100
      : null;

  const inFlight =
    v.submittedRound !== null && v.settledRound !== null && v.submittedRound > v.settledRound;

  const stages: { label: string; dot: Dot; text: string }[] = [
    {
      label: "Recorded",
      dot: v.liveWork === null ? "na" : liveStale ? "wait" : "ok",
      text:
        v.liveWork === null
          ? "Unavailable"
          : `Device ${v.coreStatus ?? "unknown"}${liveStale ? " (stale)" : ""}` +
            (v.currentRound !== null ? ` · round ${fmtInt(v.currentRound)} open` : ""),
    },
    {
      label: "Verified",
      dot: v.oracleState === "accepted" ? "ok" : v.oracleState === null ? "na" : "wait",
      text:
        v.closedRound === null
          ? "Unavailable"
          : `Closed through round ${fmtInt(v.closedRound)} · ${v.oracleState ?? "unknown"}`,
    },
    {
      label: "Settled",
      dot: v.settledRound === null ? "na" : inFlight ? "wait" : "ok",
      text:
        v.settledRound === null
          ? "Unavailable"
          : `Confirmed through round ${fmtInt(v.settledRound)}` +
            (inFlight ? ` · round ${fmtInt(v.submittedRound)} ${v.submissionLifecycle ?? "submitted"}` : ""),
    },
    {
      label: "Rewards",
      dot:
        v.rewardsRound === null
          ? "na"
          : v.settledRound !== null && v.rewardsRound < v.settledRound
            ? "wait"
            : "ok",
      text:
        v.rewardsRound === null
          ? "Unavailable"
          : `Processed through round ${fmtInt(v.rewardsRound)}`,
    },
  ];

  const maxWork = v.buckets
    ? v.buckets.reduce((m, b) => (b.work !== null && b.work > m ? b.work : m), BigInt(0))
    : BigInt(0);

  return (
    <>
      {error && (
        <div className="banner">
          Couldn&apos;t refresh. Showing data from {ago(new Date(loaded.fetchedAt).toISOString(), now)}.
        </div>
      )}
      {dataStale && !error && <div className="banner">This page hasn&apos;t refreshed in a while.</div>}
      {loaded.missing.length > 0 && (
        <div className="banner">Unavailable right now: {loaded.missing.join(", ")}.</div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <div className="row">
            <span className="tag live">Live</span>
            <span className={`pill ${liveStale ? "warn" : "ok"}`}>
              {liveStale ? "Stale" : (v.coreStatus ?? "Unknown")}
            </span>
          </div>
          <div className="stat live">{fmtInt(v.liveWork)}</div>
          <div className="muted">Work units counted on the device</div>
          <div className="sub">Observed {ago(v.observedAt, now)}</div>
        </section>

        <section className="card">
          <div className="row">
            <span className="tag settled">Settled</span>
            <span className="pill ok">
              {v.settledRound !== null ? `Round ${fmtInt(v.settledRound)}` : "Unavailable"}
            </span>
          </div>
          <div className="stat settled">{fmtInt(v.settledWork)}</div>
          <div className="muted">Work units confirmed on Ethereum</div>
          <div className="sub">Confirmed {ago(v.confirmedAt, now)}</div>
        </section>
      </div>

      <section className="card gap">
        <div>
          <div className="eyebrow">Gap between live and settled</div>
          <div className="gapnum">
            {gap === null ? "Unavailable" : gap === BigInt(0) ? "Caught up" : `${fmtInt(gap)} work units ahead`}
          </div>
        </div>
        <div className="sub">
          {roundsOpen === null
            ? "Round gap unavailable"
            : roundsOpen === BigInt(0)
              ? "No closed rounds waiting for confirmation"
              : `${fmtInt(roundsOpen)} closed round${roundsOpen === BigInt(1) ? "" : "s"} waiting for confirmation`}
        </div>
      </section>

      <section className="dotpanel" style={{ marginTop: 16 }}>
        <div className="row">
          <span className="eyebrow">Block progress</span>
          <span className="eyebrow">Settled basis</span>
        </div>
        <div className="bar" style={{ marginTop: 12 }}>
          <span style={{ width: `${pct === null ? 0 : Math.min(100, pct * 100)}%` }} />
        </div>
        <div className="kv">
          <div>
            <span className="sub">Completed blocks</span>
            <strong>{fmtInt(v.blockHeight)}</strong>
          </div>
          <div>
            <span className="sub">Next block</span>
            <strong>{pct === null ? "Unavailable" : `${(pct * 100).toFixed(2)}%`}</strong>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow">Where the work is right now</div>
        <ol className="stages">
          {stages.map((s) => (
            <li key={s.label} className="stage">
              <span className={`dot ${s.dot}`} />
              <span className="stagename">{s.label}</span>
              <span className="sub">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="row">
          <span className="eyebrow">Work settled per hour · last 24h</span>
          <span className="sub">local time</span>
        </div>
        {v.buckets && v.buckets.length > 0 ? (
          <>
            <div className="bars" role="img" aria-label="Work settled in each of the last 24 hours">
              {v.buckets.map((b) => {
                const h =
                  b.work !== null && maxWork > BigInt(0)
                    ? Math.max(0, Math.round((Number(b.work) / Number(maxWork)) * 100))
                    : 0;
                const zero = b.work === null || b.work === BigInt(0);
                return (
                  <div
                    key={b.startAt}
                    className="barcol"
                    title={`${hourLabel(b.startAt)} · ${fmtInt(b.work)} work · ${fmtInt(b.blocks)} blocks`}
                  >
                    <span className={zero ? "zero" : ""} style={{ height: zero ? undefined : `${h}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="axis">
              <span>{hourLabel(v.buckets[0].startAt)}</span>
              <span>{hourLabel(v.buckets[Math.floor(v.buckets.length / 2)].startAt)}</span>
              <span>{hourLabel(v.buckets[v.buckets.length - 1].startAt)}</span>
            </div>
            <div className="kv">
              <div>
                <span className="sub">Settlements</span>
                <strong>{fmtInt(v.windowSettlements)}</strong>
              </div>
              <div>
                <span className="sub">Work settled</span>
                <strong>{fmtInt(v.windowWork)}</strong>
              </div>
              <div>
                <span className="sub">Blocks completed</span>
                <strong>{fmtInt(v.windowBlocks)}</strong>
              </div>
            </div>
            <p className="sub" style={{ marginTop: 12 }}>
              Bars are grouped by settlement time. An empty bar means no accepted work was settled
              in that hour. It does not show what the hamster did.
            </p>
          </>
        ) : (
          <p className="muted">Unavailable</p>
        )}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="eyebrow">Issuance</div>
        <div className="kv">
          <div>
            <span className="sub">SQK minted so far</span>
            <strong>{fmtUnits(v.totalMinted, v.decimals)}</strong>
          </div>
          <div>
            <span className="sub">Supply cap</span>
            <strong>{fmtUnits(v.cap, v.decimals, 0)}</strong>
          </div>
          <div>
            <span className="sub">Share of cap</span>
            <strong>{capPct === null ? "Unavailable" : `${capPct.toFixed(2)}%`}</strong>
          </div>
          <div>
            <span className="sub">Minted in the last 24h</span>
            <strong>{fmtUnits(v.windowSqk, v.decimals)}</strong>
          </div>
        </div>
        <p className="sub" style={{ marginTop: 12 }}>
          Testnet token on Sepolia
          {v.releaseId ? ` · release ${v.releaseId}` : ""}
          {v.paused ? " · minting paused" : ""}
        </p>
      </section>
    </>
  );
}
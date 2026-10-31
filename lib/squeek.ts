export const API_BASE = "https://api.squeekchain.com/v1";

export function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur !== null && typeof cur === "object" && key in cur) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function big(v: unknown): bigint | null {
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isSafeInteger(v)) return BigInt(v);
  return null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export function isAvailable(body: unknown): boolean {
  return body !== null && typeof body === "object" && pick(body, "status") !== "unavailable";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${API_BASE}${path}`, {
      signal,
      headers: { accept: "application/json" },
    });
    if (res.ok) return res.json();
    if ([429, 503, 504].includes(res.status) && attempt === 0) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
      await sleep(Math.min(wait, 8000));
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${path}`);
  }
  throw new Error(`Request failed for ${path}`);
}

export function fmtInt(v: bigint | null): string {
  return v === null ? "Unavailable" : v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtUnits(v: bigint | null, decimals = 18, frac = 2): string {
  if (v === null) return "Unavailable";
  const base = BigInt("1" + "0".repeat(decimals));
  const whole = v / base;
  const rem = v % base;
  const fraction = rem.toString().padStart(decimals, "0").slice(0, frac);
  return frac > 0 ? `${fmtInt(whole)}.${fraction}` : fmtInt(whole);
}

export type Bucket = {
  startAt: string;
  work: bigint | null;
  blocks: bigint | null;
  sqk: bigint | null;
};

export type View = {
  liveWork: bigint | null;
  coreStatus: string | null;
  freshness: string | null;
  observedAt: string | null;
  staleAfter: number | null;
  settledWork: bigint | null;
  settledRound: bigint | null;
  confirmedAt: string | null;
  blockHeight: bigint | null;
  blockProgress: bigint | null;
  oracleState: string | null;
  closedRound: bigint | null;
  submittedRound: bigint | null;
  submissionLifecycle: string | null;
  currentRound: bigint | null;
  rewardsRound: bigint | null;
  totalMinted: bigint | null;
  cap: bigint | null;
  decimals: number;
  releaseId: string | null;
  paused: boolean | null;
  buckets: Bucket[] | null;
  windowSettlements: bigint | null;
  windowWork: bigint | null;
  windowBlocks: bigint | null;
  windowSqk: bigint | null;
};

export function buildView(status: unknown, settlements: unknown, economy: unknown): View {
  const sOk = status !== null && isAvailable(status);
  const bOk = sOk && pick(status, "builder.status") === "available";
  const tOk = settlements !== null && isAvailable(settlements);
  const eOk = economy !== null && isAvailable(economy);

  const fromStatus = (path: string) => (sOk ? pick(status, path) : undefined);
  const fromBuilder = (path: string) => (bOk ? pick(status, path) : undefined);
  const fromSettlements = (path: string) => (tOk ? pick(settlements, path) : undefined);
  const fromEconomy = (path: string) => (eOk ? pick(economy, path) : undefined);

  const rawBuckets = fromSettlements("buckets");
  const buckets: Bucket[] | null = Array.isArray(rawBuckets)
    ? rawBuckets.map((b: unknown) => ({
        startAt: str(pick(b, "startAt")) ?? "",
        work: big(pick(b, "workAdded")),
        blocks: big(pick(b, "completedBlockCount")),
        sqk: big(pick(b, "sqkMintedBaseUnits")),
      }))
    : null;

  const windowSqk =
    buckets && buckets.every((b) => b.sqk !== null)
      ? buckets.reduce((sum, b) => sum + (b.sqk as bigint), BigInt(0))
      : null;

  return {
    liveWork: big(fromStatus("measurement.cumulativeWorkUnits")),
    coreStatus: str(fromStatus("measurement.coreStatus")),
    freshness: str(fromStatus("measurement.freshness")),
    observedAt: str(fromStatus("measurement.observedAt")),
    staleAfter: num(fromStatus("measurement.staleAfterSeconds")),
    settledWork: big(fromBuilder("builder.anchor.cumulativeWork")),
    settledRound: big(fromBuilder("builder.anchor.settledThroughRound")),
    confirmedAt: str(fromBuilder("builder.anchor.confirmedAt")),
    blockHeight: big(fromBuilder("builder.anchor.blockHeight")),
    blockProgress: big(fromBuilder("builder.anchor.blockProgress")),
    oracleState: str(fromStatus("oracle.state")),
    closedRound: big(fromStatus("oracle.latestClosure.lastRound")),
    submittedRound: big(fromStatus("settlementQueue.latestSubmission.settledThroughRound")),
    submissionLifecycle: str(fromStatus("settlementQueue.latestSubmission.lifecycle")),
    currentRound: big(fromEconomy("lifecycle.currentRound")),
    rewardsRound: big(fromEconomy("mining.processedThroughRound")),
    totalMinted: big(fromEconomy("supply.totalMintedBaseUnits")),
    cap: big(fromEconomy("supply.capBaseUnits")),
    decimals: num(fromEconomy("asset.decimals")) ?? 18,
    releaseId: str(fromEconomy("release.id")),
    paused: bool(fromEconomy("lifecycle.paused")),
    buckets,
    windowSettlements: big(fromSettlements("summary.settlementCount")),
    windowWork: big(fromSettlements("summary.workAdded")),
    windowBlocks: big(fromSettlements("summary.completedBlockCount")),
    windowSqk,
  };
}
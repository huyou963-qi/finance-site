import { isIbkrTwsMode } from "@/lib/data/ibkrApiConfig";
import { cpFetch } from "@/lib/data/ibkrCpFetch";

function num(x: unknown): number | undefined {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "") {
    const s = x.trim().replace(/%/g, "");
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export type IbkrMarketSnapshotQuote = {
  lastPrice?: number;
  changePct?: number;
  volume?: number;
};

const SNAPSHOT_FIELDS = "31,83,7762";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** IB snapshot：首次请求常仅订阅，短延迟后二次请求取字段值 */
async function fetchSnapshotChunk(
  conids: number[],
): Promise<Map<number, IbkrMarketSnapshotQuote>> {
  const out = new Map<number, IbkrMarketSnapshotQuote>();
  if (!conids.length) return out;

  const qs = new URLSearchParams({
    conids: conids.join(","),
    fields: SNAPSHOT_FIELDS,
  });
  const path = `/iserver/marketdata/snapshot?${qs.toString()}`;

  await cpFetch(path, { method: "GET" });
  await sleep(450);
  const res = await cpFetch(path, { method: "GET" });
  if (!res.ok) return out;

  const json: unknown = await res.json().catch(() => null);
  if (!Array.isArray(json)) return out;

  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const conid = num(row.conid);
    if (conid == null) continue;
    const quote: IbkrMarketSnapshotQuote = {
      lastPrice: num(row["31"]),
      changePct: num(row["83"]),
      volume: num(row["7762"]) ?? num(row["87"]),
    };
    if (
      quote.lastPrice == null &&
      quote.changePct == null &&
      quote.volume == null
    ) {
      continue;
    }
    out.set(conid, quote);
  }
  return out;
}

/** 批量拉取自选 conid 行情（31=最新价，83=涨跌幅%，7762=成交量） */
export async function fetchIbkrMarketSnapshots(
  conids: number[],
): Promise<Map<number, IbkrMarketSnapshotQuote>> {
  if (isIbkrTwsMode()) {
    return new Map();
  }
  const unique = [...new Set(conids.filter((c) => Number.isFinite(c) && c > 0))];
  const merged = new Map<number, IbkrMarketSnapshotQuote>();
  const CHUNK = 50;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    try {
      const part = await fetchSnapshotChunk(chunk);
      for (const [k, v] of part) merged.set(k, v);
    } catch {
      /* 无行情订阅时跳过该批 */
    }
    if (i + CHUNK < unique.length) await sleep(120);
  }
  return merged;
}

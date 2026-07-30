/**
 * FMP analyst estimates → Forward EPS 时间轴（供 close / fwdEps = Forward PE）。
 */

import {
  forwardPeFromCloses,
  type ForwardEpsPoint,
} from "@/lib/data/forwardPeSeries";

const FMP_BASE = "https://financialmodelingprep.com/stable";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type { ForwardEpsPoint };
export { forwardPeFromCloses };

export async function fetchForwardEpsFromFmp(symbol: string): Promise<{
  symbol: string;
  timeline: ForwardEpsPoint[];
  attribution: string;
}> {
  const key = process.env.FMP_API_KEY?.trim();
  if (!key) throw new Error("缺少 FMP_API_KEY，无法拉取 Forward PE");

  const sym = symbol.trim().toUpperCase();
  const url = `${FMP_BASE}/analyst-estimates?symbol=${encodeURIComponent(sym)}&period=annual&limit=10&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `FMP analyst-estimates 失败（${sym}）：HTTP ${res.status} ${text.slice(0, 160)}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`FMP analyst-estimates 返回非 JSON：${text.slice(0, 120)}`);
  }
  if (!Array.isArray(json)) {
    throw new Error(`FMP analyst-estimates 未返回数组（${sym}）`);
  }

  const timeline: ForwardEpsPoint[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const dateRaw = r.date ?? r.fiscalDate;
    if (typeof dateRaw !== "string") continue;
    const date = dateRaw.trim().slice(0, 10);
    if (!date) continue;
    const eps =
      num(r.estimatedEpsAvg) ??
      num(r.estimatedEpsHigh) ??
      num(r.epsAvg) ??
      num(r.estimatedEps);
    if (eps == null || eps <= 0) continue;
    timeline.push({ date, forwardEps: eps });
  }
  timeline.sort((a, b) => a.date.localeCompare(b.date));
  if (!timeline.length) {
    throw new Error(`FMP 未返回有效 Forward EPS（${sym}）`);
  }

  return {
    symbol: sym,
    timeline,
    attribution: "Forward EPS：Financial Modeling Prep analyst-estimates",
  };
}

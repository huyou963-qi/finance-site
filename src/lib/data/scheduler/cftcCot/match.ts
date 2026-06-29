import type { CftcCotRow, CotMatchSpec } from "./types";

function patternTest(text: string, patterns: string[]): boolean {
  if (!patterns.length) return true;
  const upper = text.toUpperCase();
  return patterns.some((p) => {
    if (p.startsWith("^") && p.endsWith("$")) {
      return new RegExp(p, "i").test(text);
    }
    return upper.includes(p.toUpperCase());
  });
}

export function rowMatchesSpec(row: CftcCotRow, spec: CotMatchSpec): boolean {
  const market = row.market;
  const commodity = row.commodity;

  if (spec.excludeMarketPatterns?.some((p) => market.toUpperCase().includes(p.toUpperCase()))) {
    return false;
  }

  if (spec.mode === "aggregate_markets" && spec.exactMarketSubstrings?.length) {
    return spec.exactMarketSubstrings.some((sub) =>
      market.toUpperCase().includes(sub.toUpperCase()),
    );
  }

  const commodityOk = patternTest(commodity, spec.commodityPatterns);
  const marketOk = patternTest(`${commodity} ${market}`, spec.marketPatterns);
  return commodityOk && marketOk;
}

/** 按 report_date 提取 Managed Money long/short 序列 */
export function extractMmSeries(
  rows: CftcCotRow[],
  spec: CotMatchSpec,
): Array<{ obsDate: Date; long: number; short: number }> {
  const matched = rows.filter((r) => rowMatchesSpec(r, spec));
  if (!matched.length) return [];

  if (spec.mode === "aggregate_markets") {
    const byDate = new Map<string, { obsDate: Date; long: number; short: number }>();
    for (const r of matched) {
      const key = r.reportDateIso;
      const cur = byDate.get(key) ?? { obsDate: r.reportDate, long: 0, short: 0 };
      cur.long += r.mmLong ?? 0;
      cur.short += r.mmShort ?? 0;
      byDate.set(key, cur);
    }
    return [...byDate.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  }

  const byDate = new Map<string, CftcCotRow>();
  for (const r of matched) {
    const key = r.reportDateIso;
    const existing = byDate.get(key);
    if (!existing || (r.openInterest ?? 0) > (existing.openInterest ?? 0)) {
      byDate.set(key, r);
    }
  }

  return [...byDate.values()]
    .map((r) => ({
      obsDate: r.reportDate,
      long: r.mmLong ?? 0,
      short: r.mmShort ?? 0,
    }))
    .sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

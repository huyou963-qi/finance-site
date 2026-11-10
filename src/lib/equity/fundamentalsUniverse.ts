/**
 * Self-built small/mid/large-cap coverage universe: the top N US-listed operating companies by
 * public float, as reported by each company on its own 10-K cover (dei:EntityPublicFloat).
 *
 * Why not the Russell 2000 list: FTSE Russell constituent data is licensed, and ETF holdings files
 * are only approximations under their own terms. Public float is an SEC fact for every 10-K filer,
 * needs no price download, and is auditable to a filing. It is measured once a year at the end of
 * each company's second fiscal quarter, so the ranking is rebuilt yearly (like Russell's June
 * reconstitution); recent IPOs without a 10-K join at the next rebuild. Shown to users as
 * 「美股公众流通市值前 3000」, never as a Russell index.
 */

export const TOP_UNIVERSE_INDEX_CODE = "US_TOP3000";
export const TOP_UNIVERSE_SIZE = 3000;

type FactPoint = { val?: number; end?: string; filed?: string; form?: string; start?: string };
type Facts = { cik?: number; entityName?: string; facts?: Record<string, Record<string, { units?: Record<string, FactPoint[]> }>> };

const monthsBefore = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};

/** No listed company is worth more than this; larger values are filer scale errors (×1,000 / ×1,000,000). */
const MAX_PLAUSIBLE_FLOAT = 6e12;

function largestRecent(facts: unknown, concept: string, since: string, asOf: string): number | null {
  const points = (facts as Facts)?.facts?.["us-gaap"]?.[concept]?.units?.USD ?? [];
  let max: number | null = null;
  for (const p of points) {
    if (typeof p.val === "number" && p.filed && p.filed >= since && p.filed <= asOf) max = Math.max(max ?? p.val, p.val);
  }
  return max;
}

/**
 * Scale-error test against the company's own balance sheet (2026-11 archive cases: Cabot 4.4e15,
 * Universal Display 6.8e12, Trustmark 9.6e11). Implausible when above $6T, above 200× total assets,
 * or above both 20× assets and 150× positive equity. Real high valuations pass: NVIDIA is ≈30×
 * assets but ≈40× equity; negative-equity companies are judged on assets alone.
 */
export function plausiblePublicFloat(value: number, assets: number | null, equity: number | null): boolean {
  if (value > MAX_PLAUSIBLE_FLOAT) return false;
  if (assets != null && assets > 0) {
    if (value > assets * 200) return false;
    if (value > assets * 20 && equity != null && equity > 0 && value > equity * 150) return false;
  }
  return true;
}

/**
 * Latest public float in USD reported on a 10-K filed within 18 months of asOf.
 * A value failing the plausibility test is divided by 1,000 then 1,000,000 (the usual filer slips:
 * thousands or millions tagged as dollars) and the first plausible result is used; `corrected` is set.
 * If no scale works, the next-latest 10-K value is tried. `rejected` counts implausible values and is
 * reported even when nothing usable is left, so the build report lists those companies for review.
 */
export function latestPublicFloat(facts: unknown, asOf: string): {
  float: { value: number; measuredAt: string; filed: string; corrected?: number } | null; rejected: number;
} {
  const points = (facts as Facts)?.facts?.dei?.EntityPublicFloat?.units?.USD ?? [];
  const since = monthsBefore(asOf, 18);
  const assets = largestRecent(facts, "Assets", since, asOf);
  const equity = largestRecent(facts, "StockholdersEquity", since, asOf);
  const recent = points.filter(p => typeof p.val === "number" && Number.isFinite(p.val) && p.val > 0 && p.end && p.filed
    && /^10-K/.test(p.form ?? "") && p.filed >= since && p.filed <= asOf)
    .sort((a, b) => b.filed!.localeCompare(a.filed!) || b.end!.localeCompare(a.end!));
  let rejected = 0;
  for (const p of recent) {
    if (plausiblePublicFloat(p.val!, assets, equity)) return { float: { value: p.val!, measuredAt: p.end!, filed: p.filed! }, rejected };
    rejected++;
    for (const divisor of [1e3, 1e6]) {
      if (plausiblePublicFloat(p.val! / divisor, assets, equity)) {
        return { float: { value: p.val! / divisor, measuredAt: p.end!, filed: p.filed!, corrected: divisor }, rejected };
      }
    }
  }
  return { float: null, rejected };
}

/**
 * Common equity only, judged from the Nasdaq Trader security name: common stock / shares / units,
 * capital stock (e.g. Alphabet Class C, GOOG), ordinary shares, shares of beneficial interest. Warrants, rights, units, preferred and depositary
 * shares, notes and debentures need no fundamentals coverage of their own.
 */
export function isCommonEquityName(name: string): boolean {
  const n = name.toLowerCase();
  const common = /common (stock|shares|units?)|capital stock|ordinary shares|shares of beneficial interest|class [a-z] (common|ordinary)/.test(n);
  if (!common) return false;
  // 名称里同时出现这些词的是附属证券（如「Units, each consisting of one share of Common Stock and …」）
  return !/\bwarrants?\b|\brights?\b|preferred|preference|depositary|\bnotes?\b|debentures?|subordinated|\bunits?\b(?!.*\bcommon units?\b)/.test(n)
    || /\bcommon units?\b/.test(n) && !/\bwarrants?\b|\brights?\b|preferred|depositary|\bnotes?\b/.test(n);
}

/**
 * Still an active US-GAAP filer: some us-gaap fact from a 10-Q/10-K filed in the last 15 months.
 * Excludes IFRS foreign filers (20-F, no us-gaap tree) and companies that stopped reporting.
 */
export function isActiveUsGaapFiler(facts: unknown, asOf: string): boolean {
  const gaap = (facts as Facts)?.facts?.["us-gaap"];
  if (!gaap) return false;
  const since = monthsBefore(asOf, 15);
  for (const concept of Object.values(gaap)) {
    for (const points of Object.values(concept.units ?? {})) {
      if (points.some(p => p.filed && p.filed >= since && p.filed <= asOf && /^10-[QK]/.test(p.form ?? ""))) return true;
    }
  }
  return false;
}

export type UniverseCandidate = { cik: string; symbols: string[]; name: string; publicFloat: number; measuredAt: string; filed: string };

/** Rank by public float (largest first, ties by CIK for determinism) and keep the top `size`. */
export function rankUniverse(candidates: readonly UniverseCandidate[], size = TOP_UNIVERSE_SIZE) {
  const ranked = [...candidates].sort((a, b) => b.publicFloat - a.publicFloat || a.cik.localeCompare(b.cik));
  const selected = ranked.slice(0, size);
  return { selected, cutoff: selected.at(-1)?.publicFloat ?? null, ranked };
}

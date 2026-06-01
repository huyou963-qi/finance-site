/** CME 月代码字母 → IB secdef month（JUL26） */
const CME_MONTH_LETTER_TO_IB: Record<string, string> = {
  F: "JAN",
  G: "FEB",
  H: "MAR",
  J: "APR",
  K: "MAY",
  M: "JUN",
  N: "JUL",
  Q: "AUG",
  U: "SEP",
  V: "OCT",
  X: "NOV",
  Z: "DEC",
};

const IB_MONTH_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

export function parseIbMonthToken(token: string): Date | null {
  const m = token
    .trim()
    .toUpperCase()
    .match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/);
  if (!m) return null;
  const mi = IB_MONTH_INDEX[m[1]!];
  if (mi === undefined) return null;
  const year = 2000 + parseInt(m[2]!, 10);
  return new Date(Date.UTC(year, mi, 1));
}

/**
 * 解析期货交割月代码（MGCN6 → root MGC + month JUL26）。
 */
export function parseIbkrFutMonthSpec(
  sym: string,
): { root: string; ibMonth: string } | null {
  const u = sym.trim().toUpperCase();
  const tail = u.match(/([FGHJKMNQUVXZ])(\d{1,4})$/);
  if (!tail?.[0]) return null;
  const root = u.slice(0, -tail[0].length);
  if (root.length < 2 || root.length > 12) return null;
  const mon = CME_MONTH_LETTER_TO_IB[tail[1].toUpperCase()];
  if (!mon) return null;
  const yearRaw = tail[2];
  const yy =
    yearRaw.length >= 4
      ? yearRaw.slice(-2)
      : yearRaw.length === 2
        ? yearRaw
        : `2${yearRaw}`;
  return { root: root.toUpperCase(), ibMonth: `${mon}${yy}` };
}

/** 从 secdef/search JSON 的 `months` 字段收集交割月 */
export function extractMonthsFromSecdefSearch(data: unknown): string[] {
  const out = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const raw = o.months;
    if (typeof raw === "string" && raw.trim()) {
      for (const part of raw.split(";")) {
        const t = part.trim().toUpperCase();
        if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}$/.test(t)) {
          out.add(t);
        }
      }
    }
    for (const k of Object.keys(o)) visit(o[k]);
  };
  visit(data);
  return [...out];
}

/** Unix 秒 → IB secdef 月份参数（如 2024-06 → JUN24） */
export function ibMonthFromUnixSec(unixSec: number): string {
  const d = new Date(Math.floor(unixSec) * 1000);
  const names = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ] as const;
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${names[d.getUTCMonth()]!}${yy}`;
}

/** MGC/GC 等在 COMEX 常仅挂牌 6/8/10/12 月 */
export const COMEX_QUARTERLY_LISTED_ROOTS = new Set([
  "GC",
  "MGC",
  "SI",
  "HG",
  "PL",
  "PA",
]);

function yyyymmFromIbMonthToken(ibMonth: string): number | null {
  const d = parseIbMonthToken(ibMonth);
  if (!d) return null;
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

/** 无精确交割月时选日历上最近的挂牌月（如 MGC 无 7 月 → 选 8 月） */
export function pickNearestIbMonth(
  listedMonths: string[],
  requestedIbMonth: string,
): string | null {
  const req = requestedIbMonth.trim().toUpperCase();
  const exact = listedMonths.find((t) => t.trim().toUpperCase() === req);
  if (exact) return exact.trim().toUpperCase();
  const target = yyyymmFromIbMonthToken(req);
  if (target == null || !listedMonths.length) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const t of listedMonths) {
    const ym = yyyymmFromIbMonthToken(t);
    if (ym == null) continue;
    const dist = Math.abs(ym - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = t.trim().toUpperCase();
      continue;
    }
    if (dist !== bestDist || !best) continue;
    const bestYm = yyyymmFromIbMonthToken(best)!;
    if (ym >= target && bestYm < target) best = t.trim().toUpperCase();
    else if (ym >= target && bestYm >= target && ym < bestYm) {
      best = t.trim().toUpperCase();
    }
  }
  return best;
}

/** 围绕 asOf 生成本品种可能挂牌的 IB 月份列表（供 TWS 连续图分页解析交割月） */
export function generateListedIbMonthsForRoot(
  root: string,
  centerUnixSec: number,
): string[] {
  const y = new Date(Math.floor(centerUnixSec) * 1000).getUTCFullYear();
  const codes = COMEX_QUARTERLY_LISTED_ROOTS.has(root.toUpperCase())
    ? (["JUN", "AUG", "OCT", "DEC"] as const)
    : ([
        "JAN",
        "FEB",
        "MAR",
        "APR",
        "MAY",
        "JUN",
        "JUL",
        "AUG",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ] as const);
  const out: string[] = [];
  for (let yr = y - 4; yr <= y + 2; yr++) {
    const yy = String(yr).slice(-2);
    for (const m of codes) out.push(`${m}${yy}`);
  }
  return out;
}

/** 连续期货向左翻页：按 asOf 时刻解析应请求的交割月 FUT */
export function pickIbFutMonthForAsOf(
  root: string,
  asOfUnixSec: number,
): string {
  const listed = generateListedIbMonthsForRoot(root, asOfUnixSec);
  const asOf = new Date(Math.floor(asOfUnixSec) * 1000);
  const front = pickFrontIbMonth(listed, asOf);
  if (front) return front;
  const requested = ibMonthFromUnixSec(asOfUnixSec);
  return pickNearestIbMonth(listed, requested) ?? requested;
}

export function pickFrontIbMonth(
  months: string[],
  asOf: Date = new Date(),
): string | null {
  const parsed = months
    .map((t) => ({ t: t.trim().toUpperCase(), d: parseIbMonthToken(t) }))
    .filter((x): x is { t: string; d: Date } => x.d != null);
  if (!parsed.length) return null;
  const asOfMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1);
  const future = parsed
    .filter((x) => x.d.getTime() >= asOfMs)
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  if (future.length) return future[0]!.t;
  return parsed.sort((a, b) => b.d.getTime() - a.d.getTime())[0]!.t;
}

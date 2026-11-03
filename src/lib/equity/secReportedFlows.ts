import type { SecFactPoint } from "./secFundamentals";

/** 同一申报、同一累计区间的已披露加减关系；缺项及歧义不作零，不跨版本相减。 */
export function reportedDurationDifference(left: SecFactPoint[], right: SecFactPoint[]): SecFactPoint[] {
  return combineReportedDurations(left, right, -1);
}

export function reportedDurationSum(left: SecFactPoint[], right: SecFactPoint[]): SecFactPoint[] {
  return combineReportedDurations(left, right, 1);
}

function combineReportedDurations(left: SecFactPoint[], right: SecFactPoint[], sign: 1 | -1): SecFactPoint[] {
  const key = (p: SecFactPoint) => p.start && p.end && p.accn && p.filed && /^10-[KQ](?:\/A)?$/.test(p.form ?? "")
    && typeof p.val === "number" && Number.isFinite(p.val)
    ? `${p.accn}|${p.form}|${p.filed}|${p.start}|${p.end}` : null;
  const indexed = (points: SecFactPoint[]) => {
    const out = new Map<string, SecFactPoint | null>();
    for (const p of points) {
      const k = key(p); if (!k) continue;
      const old = out.get(k);
      out.set(k, old === null || (old && old.val !== p.val) ? null : p);
    }
    return out;
  };
  const a = indexed(left), b = indexed(right), result: SecFactPoint[] = [];
  for (const [k, p] of a) {
    const q = b.get(k);
    if (p && q) {
      const val = p.val! + sign * q.val!;
      if (Number.isFinite(val) && Math.abs(val) <= Number.MAX_SAFE_INTEGER) result.push({ ...p, val });
    }
  }
  return result;
}

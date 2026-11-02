import { calendarQuarterLabel, type SecQuarterlyFundamentals as Quarter } from "./secFundamentals";
import { shiftFinancialQuarter } from "./industryFinancials";

export const QUARTER_VALUE_FIELDS = ["fiscalQuarter", "revenue", "revenueYoY", "grossMargin", "opMargin", "netIncome", "eps", "epsYoY", "ocf", "capex", "dividendsPaid", "buybackPaid", "totalAssets", "totalLiabilities", "equity", "longTermDebt", "cash", "sharesOutstanding"] as const;
export type StoredQuarter = Partial<Omit<Quarter, "fiscalDate" | "firstReportedAt">> & {
  period: string; fiscalDate: Date | string | null; firstReportedAt?: Date | string | null;
};
const iso = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString().slice(0, 10) : value?.slice(0, 10) ?? null;

export function quarterlyWriteWindow(rows: Quarter[]) {
  if (!rows.length || rows.length > 80) throw new Error("季度写入批次须为1–80条");
  const periods = rows.map(r => r.period).sort();
  const first = periods[0]!, last = periods.at(-1)!;
  if (new Set(periods).size !== periods.length || periods.some(p => !/^\d{4}Q[1-4]$/.test(p)) || shiftFinancialQuarter(first, 99) < last) throw new Error("季度写入时间范围过大、重复或无效");
  return { gte: shiftFinancialQuarter(first, -1), lte: shiftFinancialQuarter(last, 1) };
}

function storedValue(row: StoredQuarter): Quarter | null {
  const date = iso(row.fiscalDate);
  if (!date) return null;
  const value = { period: row.period, fiscalDate: date, firstReportedAt: iso(row.firstReportedAt) } as Quarter;
  for (const key of QUARTER_VALUE_FIELDS) Object.assign(value, { [key]: row[key] ?? null });
  return value;
}

/** 财季身份是实际截止日；仅迁移可证明由旧首三日规则产生的标签，禁止拼接不同财季字段。 */
export function planQuarterlyWrite(incoming: Quarter[], existing: StoredQuarter[], fillMissing = false) {
  const before = new Map(existing.map(r => [r.period, r]));
  const final = new Map<string, Quarter>();
  const migratedDates = new Set<string>();
  const relabelled: { from: string; to: string; fiscalDate: string }[] = [];
  // 正确标签优先，随后才合并同一实际财季的遗留副本。
  const ordered = [...existing].sort((a, b) => Number(iso(b.fiscalDate) != null && calendarQuarterLabel(iso(b.fiscalDate)!) === b.period)
    - Number(iso(a.fiscalDate) != null && calendarQuarterLabel(iso(a.fiscalDate)!) === a.period));
  for (const old of ordered) {
    const row = storedValue(old);
    if (!row) continue;
    const canonical = calendarQuarterLabel(row.fiscalDate);
    if (canonical !== row.period && calendarQuarterLabel(row.fiscalDate, 3) === row.period) {
      relabelled.push({ from: row.period, to: canonical, fiscalDate: row.fiscalDate });
      migratedDates.add(row.fiscalDate);
      row.period = canonical;
    }
    const other = final.get(row.period);
    if (other && other.fiscalDate !== row.fiscalDate) throw new Error(`财季标签冲突，需人工核查：${row.period} ${other.fiscalDate}/${row.fiscalDate}`);
    if (other) {
      let filled = false;
      for (const key of QUARTER_VALUE_FIELDS) {
        const a = other[key], b = row[key];
        if (key !== "fiscalQuarter" && key !== "epsYoY" && a != null && b != null
          && Math.abs(a - b) > Math.max(1, Math.abs(a), Math.abs(b)) * 1e-12) throw new Error(`同财季副本金额冲突：${row.fiscalDate}/${key}`);
        if (a == null && b != null) { Object.assign(other, { [key]: b }); filled = true; }
      }
      if (filled) other.firstReportedAt = [other.firstReportedAt ?? "", row.firstReportedAt ?? ""].sort().at(-1) || null;
    } else final.set(row.period, row);
  }
  for (const move of relabelled) {
    const target = before.get(move.to);
    if (target && !iso(target.fiscalDate)) throw new Error(`迁移目标缺少真实财季日期：${move.to}`);
  }
  const skipped: string[] = [];
  for (const row of incoming) {
    if (row.period !== calendarQuarterLabel(row.fiscalDate)) throw new Error(`写入标签与实际财季不符：${row.period}/${row.fiscalDate}`);
    const old = final.get(row.period);
    if ((old && old.fiscalDate !== row.fiscalDate) || (!old && before.has(row.period) && !iso(before.get(row.period)?.fiscalDate))) {
      if (old && migratedDates.has(old.fiscalDate)) throw new Error(`迁移目标财季冲突：${row.period}`);
      if (fillMissing) { skipped.push(row.period); continue; }
      final.set(row.period, { ...row });
      continue;
    }
    if (!old) { final.set(row.period, { ...row }); continue; }
    const merged = { ...row };
    let changed = false;
    for (const key of QUARTER_VALUE_FIELDS) {
      // 财季位置由完整序列重新锚定，不沿用缺季时的错位编号。
      const value = key === "fiscalQuarter" ? row[key] ?? old[key]
        : fillMissing ? old[key] ?? row[key] : row[key] ?? old[key];
      Object.assign(merged, { [key]: value });
      if (value !== old[key]) changed = true;
    }
    merged.firstReportedAt = changed || !fillMissing
      ? [old.firstReportedAt ?? "", row.firstReportedAt ?? ""].sort().at(-1) || null : old.firstReportedAt;
    final.set(row.period, merged);
  }
  // 同比依赖季度标签；迁移后用同一组保留的EPS重算，不能留下与旧错标季度比较的同比。
  if (relabelled.length) for (const row of final.values()) {
    const prior = final.get(shiftFinancialQuarter(row.period, -4));
    if (row.eps != null && prior?.eps != null && prior.eps !== 0) {
      row.epsYoY = row.eps / prior.eps - 1;
      row.firstReportedAt = [row.firstReportedAt ?? "", prior.firstReportedAt ?? ""].sort().at(-1) || null;
    } else if (migratedDates.has(row.fiscalDate)) row.epsYoY = null;
  }
  const rows = [...final.values()].filter(row => {
    const old = before.get(row.period);
    return !old || iso(old.fiscalDate) !== row.fiscalDate || QUARTER_VALUE_FIELDS.some(k => (old[k] ?? null) !== row[k])
      || iso(old.firstReportedAt) !== row.firstReportedAt;
  }).sort((a, b) => a.period.localeCompare(b.period));
  const obsolete = relabelled.filter(r => !final.has(r.from)).map(r => ({ period: r.from, fiscalDate: r.fiscalDate }));
  return { rows, obsolete, relabelled, skipped };
}

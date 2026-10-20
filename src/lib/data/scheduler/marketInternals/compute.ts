export function parseFrenchDaily(csv: string, required: readonly string[]): Map<string, Record<string, number | null>> {
  let header: string[] | undefined;
  const result = new Map<string, Record<string, number | null>>();
  for (const line of csv.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const cells = line.split(",").map((s) => s.trim());
    if (!header) {
      if (cells[0] === "" && required.every((key) => cells.includes(key))) header = cells;
      continue;
    }
    if (!/^\d{8}$/.test(cells[0])) { if (result.size) break; continue; }
    const date = `${cells[0].slice(0, 4)}-${cells[0].slice(4, 6)}-${cells[0].slice(6)}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || cells.length !== header.length || result.has(date)) throw new Error(`French日频表结构异常: ${date}`);
    const values = Object.fromEntries(required.map((key) => {
      const raw = cells[header!.indexOf(key)];
      const v = Number(raw);
      if (raw !== "" && !Number.isFinite(v)) throw new Error(`French数值异常: ${date}/${key}`);
      return [key, raw === "" || v === -99.99 || v === -999 ? null : v];
    }));
    result.set(date, values);
  }
  if (!result.size) throw new Error("French日频表未识别");
  return result;
}

/** 日历索引连续才形成均线；缺交易日必须重启窗口，停牌不拿旧价补齐。 */
export function trendFlags(rows: readonly { index: number; close: number }[]): { index: number; above50: boolean | null; above200: boolean | null }[] {
  let last = -2;
  let count = 0;
  let sums: number[] = [0];
  return rows.map((row) => {
    if (row.index !== last + 1 || !Number.isFinite(row.close) || row.close <= 0) { count = 0; sums = [0]; }
    last = row.index;
    if (!Number.isFinite(row.close) || row.close <= 0) return { index: row.index, above50: null, above200: null };
    sums.push(sums[count] + row.close);
    count++;
    const above = (n: number) => {
      if (count < n) return null;
      const average = (sums[count] - sums[count - n]) / n;
      return row.close > average + Math.max(1e-10, Math.abs(average) * 1e-12);
    };
    return { index: row.index, above50: above(50), above200: above(200) };
  });
}

export function publishBreadth(above: number, eligible: number, members: number): number | null {
  return members >= 495 && members <= 510 && eligible / members >= 0.95 ? roundPercent(100 * above / eligible) : null;
}

export function roundPercent(value: number): number { return Math.round(value * 1e6) / 1e6; }

/** 旧快照/部分行情只能替换已核验区间，不得因此撤回更晚的已有观测。 */
export function replacementThrough(anchor: string, calendarThrough: string | null): string | null {
  return calendarThrough == null ? null : anchor < calendarThrough ? anchor : calendarThrough;
}

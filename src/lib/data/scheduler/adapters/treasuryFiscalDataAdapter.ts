import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  fetchTreasuryRows,
  parseTreasuryAmount,
  parseTreasuryDate,
  selectMts1FyMonthRow,
} from "../treasuryFiscalData/client";
import { parseTreasurySourceSpec } from "../treasuryFiscalData/types";

function filterFromStart(points: ObservationPoint[], observationStart: string): ObservationPoint[] {
  const start = parseTreasuryDate(observationStart);
  return points.filter((p) => p.obsDate >= start);
}

function effectiveFetchStart(
  observationStart: string,
  floor?: string,
): string {
  if (!floor) return observationStart;
  return observationStart > floor ? observationStart : floor;
}

function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function debtPennyToWeeklyNet(points: ObservationPoint[]): ObservationPoint[] {
  const byWeek = new Map<string, ObservationPoint>();
  for (const p of points) {
    const key = isoWeekKey(p.obsDate);
    const existing = byWeek.get(key);
    if (!existing || p.obsDate > existing.obsDate) {
      byWeek.set(key, p);
    }
  }
  const weeks = [...byWeek.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  const out: ObservationPoint[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1]!;
    const cur = weeks[i]!;
    out.push({
      obsDate: cur.obsDate,
      value: cur.value - prev.value,
    });
  }
  return out;
}

function rowsToPointsMts1FyMonth(
  rows: TreasuryRow[],
  valueField: string,
): ObservationPoint[] {
  const dates = [...new Set(rows.map((r) => r.record_date).filter(Boolean))].sort();
  const points: ObservationPoint[] = [];
  for (const recordDate of dates) {
    if (!recordDate) continue;
    const row = selectMts1FyMonthRow(rows, recordDate);
    if (!row) continue;
    const value = parseTreasuryAmount(row[valueField]);
    if (value == null) continue;
    points.push({ obsDate: parseTreasuryDate(recordDate), value });
  }
  return points;
}

function rowsToPointsMts9Sum(
  rows: TreasuryRow[],
  valueField: string,
  classes: readonly string[],
  recordTypeCd?: string,
): ObservationPoint[] {
  const classSet = new Set(classes);
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!row.record_date || !row.classification_desc) continue;
    if (!classSet.has(row.classification_desc)) continue;
    if (recordTypeCd && row.record_type_cd !== recordTypeCd) continue;
    const value = parseTreasuryAmount(row[valueField]);
    if (value == null) continue;
    byDate.set(row.record_date, (byDate.get(row.record_date) ?? 0) + value);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([recordDate, value]) => ({
      obsDate: parseTreasuryDate(recordDate),
      value,
    }));
}

function rowsToPointsDtsTgaNet(rows: TreasuryRow[], valueField: string): ObservationPoint[] {
  const depType = "Total TGA Deposits (Table II)";
  const wdType = "Total TGA Withdrawals (Table II) (-)";
  const byDate = new Map<string, { dep: number | null; wd: number | null }>();

  for (const row of rows) {
    if (!row.record_date || !row.account_type) continue;
    const slot = byDate.get(row.record_date) ?? { dep: null, wd: null };
    const value = parseTreasuryAmount(row[valueField]);
    if (value == null) continue;
    if (row.account_type === depType) slot.dep = value;
    if (row.account_type === wdType) slot.wd = value;
    byDate.set(row.record_date, slot);
  }

  const out: ObservationPoint[] = [];
  for (const [recordDate, { dep, wd }] of [...byDate.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (dep == null || wd == null) continue;
    out.push({
      obsDate: parseTreasuryDate(recordDate),
      value: dep - wd,
    });
  }
  return out;
}

function rowsToPointsDebtPennyDaily(rows: TreasuryRow[], valueField: string): ObservationPoint[] {
  const out: ObservationPoint[] = [];
  for (const row of rows) {
    if (!row.record_date) continue;
    const value = parseTreasuryAmount(row[valueField]);
    if (value == null) continue;
    out.push({
      obsDate: parseTreasuryDate(row.record_date),
      value,
    });
  }
  out.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return out;
}

type TreasuryRow = Record<string, string | null>;

export async function fetchTreasuryFiscalIncremental(
  sourceSeriesKey: string,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const spec = parseTreasurySourceSpec(sourceSeriesKey);
  const fetchStart = effectiveFetchStart(observationStart, spec.fetchStartFloor);
  const apiFilters = fetchStart
    ? `record_date:gte:${fetchStart}${spec.apiFilters ? `,${spec.apiFilters}` : ""}`
    : spec.apiFilters;

  const rows = await fetchTreasuryRows(spec.endpoint, { apiFilters });

  let allPoints: ObservationPoint[] = [];

  if (spec.rowSelector === "mts1_fy_month") {
    allPoints = rowsToPointsMts1FyMonth(rows, spec.valueField);
  } else if (spec.rowSelector === "classification_desc") {
    if (!spec.classificationDesc) {
      throw new Error("classification_desc 序列缺少 classificationDesc");
    }
    for (const row of rows) {
      if (row.classification_desc !== spec.classificationDesc) continue;
      if (spec.recordTypeCd && row.record_type_cd !== spec.recordTypeCd) continue;
      const value = parseTreasuryAmount(row[spec.valueField]);
      if (value == null || !row.record_date) continue;
      allPoints.push({
        obsDate: parseTreasuryDate(row.record_date),
        value,
      });
    }
    allPoints.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  } else if (spec.rowSelector === "account_type") {
    if (!spec.accountType) {
      throw new Error("account_type 序列缺少 accountType");
    }
    for (const row of rows) {
      if (row.account_type !== spec.accountType) continue;
      const value = parseTreasuryAmount(row[spec.valueField]);
      if (value == null || !row.record_date) continue;
      allPoints.push({
        obsDate: parseTreasuryDate(row.record_date),
        value,
      });
    }
    allPoints.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  } else if (spec.rowSelector === "mts9_sum") {
    if (!spec.sumClassificationDesc?.length) {
      throw new Error("mts9_sum 序列缺少 sumClassificationDesc");
    }
    allPoints = rowsToPointsMts9Sum(
      rows,
      spec.valueField,
      spec.sumClassificationDesc,
      spec.recordTypeCd,
    );
  } else if (spec.rowSelector === "dts_tga_net") {
    allPoints = rowsToPointsDtsTgaNet(rows, spec.valueField);
  } else if (spec.rowSelector === "debt_penny_weekly") {
    const daily = rowsToPointsDebtPennyDaily(rows, spec.valueField);
    allPoints = debtPennyToWeeklyNet(daily);
  } else {
    throw new Error(`未知 rowSelector: ${spec.rowSelector}`);
  }

  const points = filterFromStart(allPoints, observationStart);
  const skippedInvalid = allPoints.length - points.length;
  const sourceLatestObsDate =
    allPoints.length > 0 ? allPoints[allPoints.length - 1]!.obsDate : null;

  return { points, sourceLatestObsDate, skippedInvalid };
}

import type { FetchIncrementalResult, ObservationPoint } from "../types";
import {
  fetchTreasuryRows,
  parseTreasuryAmount,
  parseTreasuryDate,
  selectMts1FyMonthRow,
  selectMts1FytdRow,
} from "../treasuryFiscalData/client";
import { parseTreasurySourceSpec } from "../treasuryFiscalData/types";
import { FISCAL_NATIVE_TREASURY } from "../usFiscalFoundation/catalog";

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

/** Read the Treasury-published FYTD subtotal from each original report. */
function rowsToPointsMts1FytdCumulative(
  rows: TreasuryRow[],
  valueField: string,
): ObservationPoint[] {
  const dates = [...new Set(rows.map((row) => row.record_date).filter((date): date is string => !!date))].sort();
  const out: ObservationPoint[] = [];
  for (const date of dates) {
    const row = selectMts1FytdRow(rows, date);
    const value = parseTreasuryAmount(row[valueField]);
    if (value == null) throw new Error(`MTS FYTD 官方累计值缺失：${date}`);
    out.push({ obsDate: parseTreasuryDate(date), value });
  }
  return out;
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

/** 官方日报2021/2022改名、2022年表格改版；均读取原始收盘值，不以开盘值代替。 */
export function rowsToTgaClosingBalance(rows: TreasuryRow[]): ObservationPoint[] {
  const byDate = new Map<string,number>();
  for(const row of rows){
    if(!row.record_date)continue;
    const field=row.account_type==="Treasury General Account (TGA) Closing Balance" ? "open_today_bal" : "close_today_bal";
    const value=parseTreasuryAmount(row[field]);
    if(value==null)continue;
    if(byDate.has(row.record_date))throw new Error(`TGA收盘余额重复：${row.record_date}`);
    byDate.set(row.record_date,value);
  }
  return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({obsDate:parseTreasuryDate(date),value}));
}

export async function fetchTreasuryFiscalIncremental(
  sourceSeriesKey: string,
  observationStart: string,
): Promise<FetchIncrementalResult> {
  const spec = FISCAL_NATIVE_TREASURY.find(r => r.code === sourceSeriesKey)?.spec ?? parseTreasurySourceSpec(sourceSeriesKey);
  const fetchStart = effectiveFetchStart(observationStart, spec.fetchStartFloor);
  // 对含逗号的业务标签仅在本地匹配；其他精确条件同时下推，避免日频大表全表拉取。
  const rowMatch = { ...(spec.match ?? {}),
    ...(spec.accountType && spec.rowSelector !== "dts_tga_balance" ? { account_type: spec.accountType } : {}),
    ...(spec.classificationDesc ? { classification_desc: spec.classificationDesc } : {}),
    ...(spec.recordTypeCd ? { record_type_cd: spec.recordTypeCd } : {}) };
  const matches = Object.entries(rowMatch).filter(([,v]) => !v.includes(",")).map(([k,v]) => `${k}:eq:${v}`);
  const apiFilters = [fetchStart ? `record_date:gte:${fetchStart}` : "", spec.apiFilters, ...matches].filter(Boolean).join(",");

  const rows = spec.rowSelector === "dts_tga_balance"
    ? (await Promise.all(["Federal Reserve Account", "Treasury General Account (TGA)", "Treasury General Account (TGA) Closing Balance"].map(account =>
      fetchTreasuryRows(spec.endpoint,{apiFilters:`${apiFilters},account_type:eq:${account}`,pageSize:10000})))).flat()
    : spec.rowSelector === "dts_tga_net"
    ? (await Promise.all(["Total TGA Deposits (Table II)", "Total TGA Withdrawals (Table II) (-)"].map(account =>
      fetchTreasuryRows(spec.endpoint, { apiFilters: `${apiFilters},account_type:eq:${account}`, pageSize:10000 })))).flat()
    : await fetchTreasuryRows(spec.endpoint, { apiFilters, pageSize:10000 });

  let allPoints: ObservationPoint[] = [];
  let missingValues = 0;

  if (spec.rowSelector === "fields") {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!Object.entries(spec.match ?? {}).every(([key,value]) => row[key] === value)) continue;
      if (!row.record_date) throw new Error("Treasury 原始行缺少日期");
      if (seen.has(row.record_date)) throw new Error(`Treasury 原始行重复：${sourceSeriesKey} ${row.record_date}`);
      seen.add(row.record_date);
      const value = parseTreasuryAmount(row[spec.valueField]);
      if (!(spec.valueField in row)) throw new Error(`Treasury响应缺少字段：${spec.valueField}`);
      if (value == null) { missingValues++; continue; } // 官方空值不补零，也不丢弃其余有效历史。
      allPoints.push({ obsDate: parseTreasuryDate(row.record_date), value });
    }
    allPoints.sort((a,b) => a.obsDate.getTime() - b.obsDate.getTime());
  } else if (spec.rowSelector === "dts_tga_balance") {
    allPoints=rowsToTgaClosingBalance(rows);
  } else if (spec.rowSelector === "mts1_fy_month") {
    allPoints = rowsToPointsMts1FyMonth(rows, spec.valueField);
  } else if (spec.rowSelector === "mts1_fytd_cumulative") {
    allPoints = rowsToPointsMts1FytdCumulative(rows, spec.valueField);
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
  } else if (spec.rowSelector === "debt_penny_daily") {
    allPoints = rowsToPointsDebtPennyDaily(rows, spec.valueField);
  } else if (spec.rowSelector === "debt_penny_weekly") {
    const daily = rowsToPointsDebtPennyDaily(rows, spec.valueField);
    allPoints = debtPennyToWeeklyNet(daily);
  } else {
    throw new Error(`未知 rowSelector: ${spec.rowSelector}`);
  }

  const points = filterFromStart(allPoints, observationStart);
  const skippedInvalid = allPoints.length - points.length + missingValues;
  const sourceLatestObsDate =
    allPoints.length > 0 ? allPoints[allPoints.length - 1]!.obsDate : null;

  return { points, sourceLatestObsDate, skippedInvalid };
}

import { SourceAdapterKind, type DataGranularity } from "@prisma/client";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";
import { isHistoricalCensusSeries } from "./usTradeDetail/lifecycle";
import { sourcePendingUntil } from "./sourcePending";

export type FreshnessFindingCode =
  | "no_subscription" | "disabled" | "unschedulable" | "no_observations"
  | "never_fetched" | "bookkeeping_drift" | "fetch_error" | "overdue"
  | "source_ahead" | "source_value_differs" | "source_probe_failed" | "source_pending";

export type FreshnessFinding = {
  code: FreshnessFindingCode;
  severity: "critical" | "warning";
  instrumentCode: string;
  sourceId: string | null;
  packageId: string | null;
  detail: string;
};

export type FreshnessAuditRow = {
  instrumentCode: string;
  metadata: unknown;
  sourceId: string | null;
  packageId: string | null;
  adapterKind: SourceAdapterKind | null;
  sourceSeriesKey: string | null;
  enabled: boolean | null;
  granularity: DataGranularity | null;
  nextRunAt: Date | null;
  lastSuccessAt: Date | null;
  subscribedLastObsDate: Date | null;
  actualLastObsDate: Date | null;
  actualLastValue: number | null;
  lastError: string | null;
  lastFetchStatus: string | null;
  lastFetchAt: Date | null;
  projectionLastObsDate?: Date | null;
};

/** Explicit lifecycle exceptions are reported separately, never counted as live feeds. */
export function freshnessScope(row: FreshnessAuditRow): { mode: "live" | "archive" | "projection" | "licensed"; reason: string } {
  const md = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  if (md.projectionOnly === true && md.sourceTag === "quant-macro-regime-projection" &&
      ["quant_regime_growth_z", "quant_regime_inflation_mom_z", "quant_regime_quadrant_band"].includes(row.instrumentCode)) {
    return {mode:"projection",reason:"事实来自 mds.macro_regime，单独核对投影字段"};
  }
  if (row.actualLastObsDate && row.enabled === false && (
    (row.sourceId === "mof-budget-accounts" && md.historicalOnly === true && md.archiveAfterBootstrap === true) ||
    (row.sourceId === "us-census-trade-detail" && isHistoricalCensusSeries(row.sourceSeriesKey)) ||
    (row.sourceId === "fred" && row.sourceSeriesKey === "IEASAD" && md.historicalOnly === true)
  )) return {mode:"archive",reason:"已核实的历史序列，已回填并停止当前更新"};
  if (row.instrumentCode === "goldov_c23_comex_stock_oz" && !row.sourceId && row.actualLastObsDate) {
    return {mode:"licensed",reason:"CME 库存授权数据，保留历史；自动更新需合法授权源"};
  }
  return {mode:"live",reason:"当前自动更新序列"};
}

/** Checks every visible indicator against the same eligibility gate used by the worker. */
export function inspectFreshnessRow(row: FreshnessAuditRow, now: Date): FreshnessFinding[] {
  const out: FreshnessFinding[] = [];
  const add = (code: FreshnessFindingCode, severity: FreshnessFinding["severity"], detail: string) =>
    out.push({ code, severity, instrumentCode: row.instrumentCode, sourceId: row.sourceId, packageId: row.packageId, detail });

  const scope = freshnessScope(row);
  if (scope.mode === "archive" || scope.mode === "licensed") return out;
  if (scope.mode === "projection") {
    if (!row.projectionLastObsDate) add("no_observations", "critical", "mds.macro_regime 缺少有效投影事实");
    else if (now.getTime() - row.projectionLastObsDate.getTime() > 120 * 86400_000) add("overdue", "critical", "mds.macro_regime 最新有效投影超过 120 天");
    return out;
  }

  if (!row.sourceId) add("no_subscription", "critical", "目录指标没有数据订阅");
  else if (!row.enabled) add("disabled", "critical", "目录指标的数据订阅未启用");
  else if (!row.adapterKind || !subscriptionEligibleForSchedule({
    subscriptionEnabled: true,
    adapterKind: row.adapterKind,
    sourceSeriesKey: row.sourceSeriesKey,
    metadata: row.metadata,
  })) add("unschedulable", "critical", "worker 的实际准入检查不会选中此订阅");

  if (!row.actualLastObsDate) add("no_observations", "critical", "观测表中没有任何数据点");
  if (row.sourceId && !row.lastSuccessAt) add("never_fetched", "warning", "订阅从未成功执行；历史数据可能来自导入");
  if (row.actualLastObsDate && (!row.subscribedLastObsDate ||
    row.actualLastObsDate.getTime() !== row.subscribedLastObsDate.getTime())) {
    add("bookkeeping_drift", "warning", `订阅末期 ${row.subscribedLastObsDate?.toISOString().slice(0, 10) ?? "空"}，实际观测 ${row.actualLastObsDate.toISOString().slice(0, 10)}`);
  }
  const pendingUntil = sourcePendingUntil(row.lastError);
  if (pendingUntil) {
    // Source published the period but has not filled this member yet; only
    // an alarm once the source's normal catch-up window has passed.
    const late = now > pendingUntil;
    add("source_pending", late ? "critical" : "warning",
      `${late ? "源端补齐已超期" : `源端待补齐（宽限至 ${pendingUntil.toISOString().slice(0, 10)}）`}：${row.lastError!.slice(0, 160)}`);
  } else if (row.lastError || row.lastFetchStatus === "FAILED") {
    add("fetch_error", "critical", (row.lastError ?? "最近一次抓取失败").slice(0, 180));
  }
  if (row.enabled && row.nextRunAt) {
    const graceHours = row.granularity === "DAILY" || row.granularity === "WEEKLY" ? 6 : 24;
    const lateMs = now.getTime() - row.nextRunAt.getTime();
    if (lateMs > graceHours * 3_600_000) {
      add("overdue", "critical", `排期已过 ${Math.floor(lateMs / 3_600_000)} 小时，仍未推进`);
    }
  }
  return out;
}

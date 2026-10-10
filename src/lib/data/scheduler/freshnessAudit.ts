import { SourceAdapterKind, type DataGranularity } from "@prisma/client";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";

export type FreshnessFindingCode =
  | "no_subscription" | "disabled" | "unschedulable" | "no_observations"
  | "never_fetched" | "bookkeeping_drift" | "fetch_error" | "overdue"
  | "source_ahead" | "source_value_differs" | "source_probe_failed";

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
};

/** Checks every visible indicator against the same eligibility gate used by the worker. */
export function inspectFreshnessRow(row: FreshnessAuditRow, now: Date): FreshnessFinding[] {
  const out: FreshnessFinding[] = [];
  const add = (code: FreshnessFindingCode, severity: FreshnessFinding["severity"], detail: string) =>
    out.push({ code, severity, instrumentCode: row.instrumentCode, sourceId: row.sourceId, packageId: row.packageId, detail });

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
  if (row.lastError || row.lastFetchStatus === "FAILED") {
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

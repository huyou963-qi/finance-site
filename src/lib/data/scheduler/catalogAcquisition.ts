import { SourceAdapterKind } from "@prisma/client";
import {
  isExcelOnlyFetchAcquisition,
  isExcelTemplateInstrument,
  readFetchAcquisition,
} from "./fetchAcquisition";
import type { SourceSyncSnapshot } from "./releaseRule";

export type AcquisitionStatus = "ready" | "bootstrap_only" | "tbd" | "probe_failed";

/**
 * 指标更新状态（与 acquisition 正交）
 * - on_schedule: 未到下次更新日
 * - stale: 本地应拉取但未跟上（到期且未确认已同步源端）
 * - source_current: 已确认本地=源端最新；源端本身滞后（如 6 月仍只有 3 月值）不算未更新
 * - not_applicable: 无自动订阅 / 未就绪
 */
export type UpdateStatus = "on_schedule" | "stale" | "source_current" | "not_applicable";

const AUTO_ADAPTERS = new Set<SourceAdapterKind>([
  SourceAdapterKind.FRED_API,
  SourceAdapterKind.WORLD_BANK_API,
  SourceAdapterKind.REST_API,
]);

export function isExcelBootstrap(metadata: unknown): boolean {
  return isExcelTemplateInstrument(metadata);
}

export function isNetworkAutoAdapter(
  adapterKind: SourceAdapterKind | null | undefined,
): boolean {
  return adapterKind != null && AUTO_ADAPTERS.has(adapterKind);
}

/** Excel 历史导入后是否仍缺网络自动源（须配 FRED/REST/WB + 探测） */
/** 网络获取方式已确认：才参与下次更新 / 更新计划 / 调度状态 */
export function isNetworkAcquisitionConfirmed(params: {
  inDatabase: boolean;
  acquisitionStatus: AcquisitionStatus | null;
  fetchAcquisitionStatus: "known" | "pending" | null;
}): boolean {
  if (!params.inDatabase) return false;
  return (
    params.acquisitionStatus === "ready" &&
    params.fetchAcquisitionStatus === "known"
  );
}

export function needsNetworkSource(params: {
  metadata: unknown;
  acquisitionStatus: AcquisitionStatus | null;
}): boolean {
  if (!isExcelBootstrap(params.metadata)) return false;
  return params.acquisitionStatus !== "ready";
}

export function resolveAcquisitionStatus(params: {
  subscriptionEnabled: boolean | null;
  adapterKind: SourceAdapterKind | null;
  sourceSeriesKey: string | null;
  metadata: unknown;
}): AcquisitionStatus {
  const md =
    params.metadata && typeof params.metadata === "object"
      ? (params.metadata as Record<string, unknown>)
      : null;
  const excelBootstrap = isExcelBootstrap(params.metadata);

  if (
    params.adapterKind === SourceAdapterKind.BULK_FILE ||
    params.adapterKind === SourceAdapterKind.MANUAL
  ) {
    return "bootstrap_only";
  }

  if (!params.subscriptionEnabled) {
    return excelBootstrap || md?.bootstrapOnly === true ? "bootstrap_only" : "tbd";
  }

  if (!params.adapterKind) return excelBootstrap ? "bootstrap_only" : "tbd";

  if (!params.sourceSeriesKey?.trim()) {
    return excelBootstrap || md?.bootstrapOnly === true ? "bootstrap_only" : "tbd";
  }

  if (!AUTO_ADAPTERS.has(params.adapterKind)) {
    return excelBootstrap ? "bootstrap_only" : "tbd";
  }

  if (md?.bootstrapOnly === true) return "bootstrap_only";

  const fa = readFetchAcquisition(params.metadata);
  if (isExcelOnlyFetchAcquisition(fa)) return "bootstrap_only";
  if (fa?.status === "pending") return "probe_failed";

  if (isExcelTemplateInstrument(params.metadata) && fa?.status !== "known") {
    return "probe_failed";
  }

  return "ready";
}

/** 最近一次拉取是否确认「本地已追上源端」 */
export function isSourceCaughtUp(params: {
  lastFetchStatus: string | null;
  lastFetchUpserted: number | null;
  sourceLagDays: number | null;
  sourceSync: SourceSyncSnapshot | null;
  calendarReleaseAt: string | null;
  lastFetchAt: Date | null;
  lastSuccessAt: Date | null;
}): boolean {
  if (params.sourceSync?.status === "current") {
    if (params.calendarReleaseAt && params.sourceSync.verifiedAt) {
      const releaseMs = new Date(params.calendarReleaseAt).getTime();
      const verifiedMs = new Date(params.sourceSync.verifiedAt).getTime();
      if (!Number.isNaN(releaseMs) && !Number.isNaN(verifiedMs) && verifiedMs >= releaseMs) {
        return true;
      }
    }
    if (params.sourceSync.verifiedAt && params.lastSuccessAt) {
      return params.lastSuccessAt.getTime() >= new Date(params.sourceSync.verifiedAt).getTime();
    }
  }

  if (!params.lastFetchAt) return false;

  const fetchOk =
    params.lastFetchStatus === "SUCCESS" ||
    params.lastFetchStatus === "SKIPPED" ||
    params.lastFetchStatus === "PARTIAL";

  if (!fetchOk) return false;

  if (params.sourceLagDays != null && params.sourceLagDays <= 0) {
    return true;
  }

  if (
    params.lastFetchStatus === "SKIPPED" &&
    (params.lastFetchUpserted ?? 0) === 0 &&
    params.sourceLagDays == null
  ) {
    return true;
  }

  return false;
}

export function resolveUpdateStatus(params: {
  acquisitionStatus: AcquisitionStatus | null;
  subscriptionEnabled: boolean | null;
  nextRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFetchStatus: string | null;
  lastFetchAt: Date | null;
  lastFetchUpserted: number | null;
  sourceLagDays: number | null;
  sourceSync: SourceSyncSnapshot | null;
  calendarReleaseAt: string | null;
  now?: Date;
}): UpdateStatus {
  if (params.acquisitionStatus !== "ready" || params.subscriptionEnabled !== true) {
    return "not_applicable";
  }

  const now = params.now ?? new Date();
  if (!params.nextRunAt || params.nextRunAt.getTime() > now.getTime()) {
    return "on_schedule";
  }

  const dueSince = params.calendarReleaseAt
    ? new Date(params.calendarReleaseAt)
    : params.nextRunAt;

  const fetchedSinceDue =
    params.lastFetchAt &&
    !Number.isNaN(dueSince.getTime()) &&
    params.lastFetchAt.getTime() >= dueSince.getTime() - 60_000;

  if (
    isSourceCaughtUp({
      lastFetchStatus: params.lastFetchStatus,
      lastFetchUpserted: params.lastFetchUpserted,
      sourceLagDays: params.sourceLagDays,
      sourceSync: params.sourceSync,
      calendarReleaseAt: params.calendarReleaseAt,
      lastFetchAt: params.lastFetchAt,
      lastSuccessAt: params.lastSuccessAt,
    }) &&
    (fetchedSinceDue ||
      (params.lastSuccessAt && params.lastSuccessAt.getTime() >= dueSince.getTime()))
  ) {
    return "source_current";
  }

  return "stale";
}

/** @deprecated 使用 resolveUpdateStatus === 'stale' */
export function computeIsStale(params: {
  acquisitionStatus: AcquisitionStatus;
  subscriptionEnabled: boolean | null;
  nextRunAt: Date | null;
  lastSuccessAt?: Date | null;
  lastFetchStatus?: string | null;
  lastFetchAt?: Date | null;
  lastFetchUpserted?: number | null;
  sourceLagDays?: number | null;
  sourceSync?: SourceSyncSnapshot | null;
  calendarReleaseAt?: string | null;
  now?: Date;
}): boolean {
  return (
    resolveUpdateStatus({
      acquisitionStatus: params.acquisitionStatus,
      subscriptionEnabled: params.subscriptionEnabled,
      nextRunAt: params.nextRunAt,
      lastSuccessAt: params.lastSuccessAt ?? null,
      lastFetchStatus: params.lastFetchStatus ?? null,
      lastFetchAt: params.lastFetchAt ?? null,
      lastFetchUpserted: params.lastFetchUpserted ?? null,
      sourceLagDays: params.sourceLagDays ?? null,
      sourceSync: params.sourceSync ?? null,
      calendarReleaseAt: params.calendarReleaseAt ?? null,
      now: params.now,
    }) === "stale"
  );
}

export function updateStatusLabel(status: UpdateStatus): string {
  switch (status) {
    case "on_schedule":
      return "等待下次更新";
    case "stale":
      return "未更新";
    case "source_current":
      return "源端暂无新值";
    case "not_applicable":
      return "不可自动更新";
  }
}

export function updateStatusReason(params: {
  status: UpdateStatus;
  nextRunAt: Date | null;
  latestObsDate: string | null;
  sourceSync: SourceSyncSnapshot | null;
  now?: Date;
}): string | null {
  const now = params.now ?? new Date();
  switch (params.status) {
    case "stale": {
      if (!params.nextRunAt) return "已到期，待拉取";
      const d = params.nextRunAt.toISOString().slice(0, 16).replace("T", " ");
      return `下次更新日 ${d} UTC 已过，本地尚未确认同步`;
    }
    case "source_current": {
      const obs = params.latestObsDate ?? params.sourceSync?.localObsDate ?? "—";
      const src = params.sourceSync?.sourceLatestObsDate;
      return src
        ? `已同步至源端最新（本地 ${obs}，源端 ${src.slice(0, 10)}）`
        : `已同步至源端最新（最新观测 ${obs}，源端尚未发布更晚数据）`;
    }
    case "on_schedule":
      return null;
    default:
      return null;
  }
}

export function staleReasonText(nextRunAt: Date | null, now: Date = new Date()): string | null {
  if (!nextRunAt || nextRunAt.getTime() > now.getTime()) return null;
  const d = nextRunAt.toISOString().slice(0, 16).replace("T", " ");
  return `下次更新日 ${d} UTC 已过`;
}

export function acquisitionStatusLabel(
  status: AcquisitionStatus,
  context?: { excelBootstrap?: boolean },
): string {
  switch (status) {
    case "ready":
      return "可自动更新";
    case "bootstrap_only":
      return context?.excelBootstrap
        ? "Excel 导入·待配网络源"
        : "不可自动更新（仅文件/手动）";
    case "probe_failed":
      return context?.excelBootstrap ? "待探测网络获取方式" : "探测未通过";
    default:
      return "待配置网络源";
  }
}

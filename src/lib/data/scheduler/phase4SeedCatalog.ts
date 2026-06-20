import type { DataGranularity } from "@prisma/client";
import { SourceAdapterKind } from "@prisma/client";
import { granularityFromFreqLabel } from "./phase2SeedCatalog";

export const PHASE4_DATA_SOURCES = {
  "overview-china": {
    id: "overview-china",
    agencyId: null as string | null,
    name: "China Overview XLSX",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: null as string | null,
    termsUrl: null as string | null,
    rateLimit: { minIntervalMs: 100 },
    metadata: { template: "china", xlsxEnvVar: "CHINA_OVERVIEW_XLSX_PATH" },
  },
  "overview-japan": {
    id: "overview-japan",
    agencyId: null as string | null,
    name: "Japan Overview XLSX",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: null as string | null,
    termsUrl: null as string | null,
    rateLimit: { minIntervalMs: 100 },
    metadata: { template: "japan", xlsxEnvVar: "JAPAN_OVERVIEW_XLSX_PATH" },
  },
  "legacy-m": {
    id: "legacy-m",
    agencyId: null as string | null,
    name: "Legacy m_ 快照",
    adapterKind: SourceAdapterKind.MANUAL,
    baseUrl: null as string | null,
    termsUrl: null as string | null,
    rateLimit: { minIntervalMs: 0 },
    metadata: { note: "MySQL h 库迁移序列，在线 API 待对接" },
  },
} as const;

export function releaseRuleForOverview(freqLabel: string | null | undefined) {
  const g = granularityFromFreqLabel(freqLabel ?? "月");
  if (g === "DAILY") return { type: "probe_interval" as const, intervalHours: 24 };
  if (g === "WEEKLY") return { type: "probe_interval" as const, intervalHours: 168 };
  if (g === "QUARTERLY") return { type: "probe_interval" as const, intervalHours: 168 };
  return {
    type: "calendar_monthly" as const,
    probeFromDay: 8,
    intervalHours: 12,
    probeUntilDay: 20,
  };
}

export function releaseRuleForLegacyM(): { type: "manual" } {
  return { type: "manual" };
}

export function granularityForInstrument(freqLabel: string | null | undefined): DataGranularity {
  return granularityFromFreqLabel(freqLabel ?? "月");
}

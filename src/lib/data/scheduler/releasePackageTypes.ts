import type { DataGranularity } from "@prisma/client";
import type { CalendarMatchSpec } from "./teEventMap";
import type {
  CalendarMatchSnapshot,
  CalendarSyncMeta,
  ReleaseRule,
  SourceSyncSnapshot,
} from "./releaseRule";

/** 发布包内成员匹配规则（seed 时解析为 Instrument） */
export type ReleasePackageMemberRule = {
  fredSeriesIds?: string[];
  instrumentCodes?: string[];
  /** 后缀 `*` 表示前缀匹配，如 `sched_fred_JTS` */
  instrumentCodePatterns?: string[];
};

export type ReleasePackageDef = {
  id: string;
  labelZh: string;
  labelEn?: string;
  countryCode: string;
  agencyId?: string;
  granularity: DataGranularity;
  calendar: CalendarMatchSpec;
  /** economic_calendar 模板（不含 calendarMatch） */
  release: Extract<ReleaseRule, { type: "economic_calendar" }>;
  sortOrder?: number;
  members: ReleasePackageMemberRule;
};

/** 存于 ReleasePackage.scheduleState */
export type ReleasePackageScheduleState = {
  calendarMatch?: CalendarMatchSnapshot;
  calendarSync?: CalendarSyncMeta;
  sourceSync?: SourceSyncSnapshot;
};

export type ReleasePackageRow = {
  id: string;
  labelZh: string;
  labelEn: string | null;
  countryCode: string;
  agencyId: string | null;
  granularity: DataGranularity;
  calendarSpec: unknown;
  releaseTemplate: unknown;
  scheduleState: unknown;
  nextRunAt: Date | null;
  enabled: boolean;
  sortOrder: number;
};

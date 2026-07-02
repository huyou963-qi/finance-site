import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { CalendarMatchSpec } from "./teEventMap";
import { getCachedPackageCalendarOverrides } from "./calendarOverrideCache";
import {
  parseReleaseRule,
  type CalendarMatchSnapshot,
  type CalendarSyncMeta,
  type ReleaseRule,
  type SourceSyncSnapshot,
} from "./releaseRule";
import type {
  ReleasePackageRow,
  ReleasePackageScheduleState,
} from "./releasePackageTypes";

const OVERRIDES_FILE = path.join(
  process.cwd(),
  ".data",
  "te-release-package-overrides.json",
);

export function parsePackageScheduleState(raw: unknown): ReleasePackageScheduleState {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const cm = r.calendarMatch as Record<string, unknown> | undefined;
  const calendarMatch: CalendarMatchSnapshot | undefined =
    cm && typeof cm.releaseAt === "string"
      ? {
          eventId: String(cm.eventId ?? ""),
          title: String(cm.title ?? ""),
          releaseAt: String(cm.releaseAt),
          syncedAt: String(cm.syncedAt ?? ""),
          source: cm.source != null ? String(cm.source) : undefined,
        }
      : undefined;
  const cs = r.calendarSync as Record<string, unknown> | undefined;
  const calendarSync: CalendarSyncMeta | undefined =
    cs && typeof cs.syncedAt === "string"
      ? {
          status: (cs.status as CalendarSyncMeta["status"]) ?? "no_match",
          message: cs.message != null ? String(cs.message) : undefined,
          syncedAt: String(cs.syncedAt),
        }
      : undefined;
  const ss = r.sourceSync as Record<string, unknown> | undefined;
  const sourceSync: SourceSyncSnapshot | undefined =
    ss && ss.status === "current" && typeof ss.verifiedAt === "string"
      ? {
          status: "current",
          verifiedAt: String(ss.verifiedAt),
          localObsDate: ss.localObsDate != null ? String(ss.localObsDate) : undefined,
          sourceLatestObsDate:
            ss.sourceLatestObsDate != null ? String(ss.sourceLatestObsDate) : undefined,
          fetchStatus: ss.fetchStatus != null ? String(ss.fetchStatus) : undefined,
        }
      : undefined;
  return { calendarMatch, calendarSync, sourceSync };
}

export function parsePackageCalendarSpec(raw: unknown): CalendarMatchSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const keywords = Array.isArray(r.keywords)
    ? r.keywords.map(String).filter(Boolean)
    : [];
  if (!keywords.length) return null;
  return {
    countryCodes: Array.isArray(r.countryCodes)
      ? r.countryCodes.map(String)
      : [],
    keywords,
    excludeKeywords: Array.isArray(r.excludeKeywords)
      ? r.excludeKeywords.map(String)
      : undefined,
    eventId: r.eventId != null ? String(r.eventId) : undefined,
  };
}

export function parsePackageReleaseTemplate(
  raw: unknown,
): Extract<ReleaseRule, { type: "economic_calendar" }> | null {
  const rule = parseReleaseRule(raw);
  return rule.type === "economic_calendar" ? rule : null;
}

function readPackageOverrides(): Record<string, CalendarMatchSpec> {
  const cached = getCachedPackageCalendarOverrides();
  if (Object.keys(cached).length > 0) return cached;
  try {
    const raw = fs.readFileSync(OVERRIDES_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<
      string,
      CalendarMatchSpec & { updatedAt?: string }
    >;
    const out: Record<string, CalendarMatchSpec> = {};
    for (const [key, spec] of Object.entries(parsed)) {
      if (!spec?.keywords?.length) continue;
      out[key] = {
        countryCodes: spec.countryCodes ?? [],
        keywords: spec.keywords,
        excludeKeywords: spec.excludeKeywords,
        eventId: spec.eventId,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function calendarSpecForPackageRow(
  pkg: Pick<ReleasePackageRow, "id" | "calendarSpec">,
): CalendarMatchSpec | null {
  const base = parsePackageCalendarSpec(pkg.calendarSpec);
  if (!base) return null;
  const override = readPackageOverrides()[pkg.id];
  return override ? { ...base, ...override } : base;
}

/** 订阅 releaseRule + 包级 schedule → 有效经济日历规则 */
export function effectiveReleaseRule(
  subscriptionRule: unknown,
  pkg: Pick<ReleasePackageRow, "releaseTemplate" | "scheduleState"> | null,
): ReleaseRule {
  const sub = parseReleaseRule(subscriptionRule);
  if (!pkg) return sub;
  const template = parsePackageReleaseTemplate(pkg.releaseTemplate);
  if (!template) return sub;
  const schedule = parsePackageScheduleState(pkg.scheduleState);
  if (sub.type !== "economic_calendar") {
    return {
      ...template,
      calendarMatch: schedule.calendarMatch,
      calendarSync: schedule.calendarSync,
      sourceSync: schedule.sourceSync,
    };
  }
  return {
    ...template,
    fallback: sub.fallback ?? template.fallback,
    calendarMatch: schedule.calendarMatch,
    calendarSync: schedule.calendarSync,
    sourceSync: schedule.sourceSync ?? sub.sourceSync,
  };
}

export type PackageByInstrument = {
  packageId: string;
  labelZh: string;
  nextRunAt: Date | null;
  scheduleState: unknown;
  releaseTemplate: unknown;
};

export async function loadPackageMapByInstrumentId(
  prisma: PrismaClient,
): Promise<Map<string, PackageByInstrument>> {
  const rows = await prisma.releasePackageMember.findMany({
    include: {
      package: {
        select: {
          id: true,
          labelZh: true,
          nextRunAt: true,
          scheduleState: true,
          releaseTemplate: true,
        },
      },
    },
  });
  const map = new Map<string, PackageByInstrument>();
  for (const row of rows) {
    map.set(row.instrumentId, {
      packageId: row.package.id,
      labelZh: row.package.labelZh,
      nextRunAt: row.package.nextRunAt,
      scheduleState: row.package.scheduleState,
      releaseTemplate: row.package.releaseTemplate,
    });
  }
  return map;
}

export async function loadEnabledReleasePackages(prisma: PrismaClient) {
  return prisma.releasePackage.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export function subscriptionLinkedToCalendarPackage(
  releasePackageId: string | null | undefined,
): boolean {
  return Boolean(releasePackageId);
}

export function stripCalendarStateFromSubscriptionRule(
  rule: ReleaseRule,
): ReleaseRule {
  if (rule.type !== "economic_calendar") return rule;
  const { calendarMatch: _cm, calendarSync: _cs, ...rest } = rule;
  return rest;
}

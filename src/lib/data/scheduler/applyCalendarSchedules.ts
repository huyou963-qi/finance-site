import type { PrismaClient } from "@prisma/client";
import type { EconomicCalendarEvent } from "./economicCalendar/types";
import {
  calendarSpecForPackageRow,
  loadEnabledReleasePackages,
  parsePackageScheduleState,
  parsePackageReleaseTemplate,
  stripCalendarStateFromSubscriptionRule,
} from "./releasePackageStore";
import {
  calendarWindowDays,
  defaultCalendarWindow,
  fetchTradingEconomicsCalendar,
} from "./tradingEconomicsCalendar/client";
import {
  calendarSpecForSubscription,
  collectCountryCodesFromSubscriptions,
  findNextCalendarRelease,
  subscriptionUsesCalendarSync,
  teCountryCodesForSpec,
} from "./teEventMap";
import {
  computeNextRunAt,
  defaultEconomicCalendarRule,
  nextRunAtFromCalendarRule,
  parseReleaseRule,
  type CalendarMatchSnapshot,
  type CalendarSyncMeta,
  type ReleaseRule,
} from "./releaseRule";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";
import { refreshCalendarOverrideCache } from "./calendarOverrideCache";
import type { ReleasePackageScheduleState } from "./releasePackageTypes";
import type { IsmOfficialRelease } from "./ismOfficial/parseCalendar";
import {
  ismOfficialReleaseToCalendarEvent,
  nextIsmOfficialRelease,
  packageIdToIsmKind,
  parseIsmOfficialCalendarPage,
} from "./ismOfficial/parseCalendar";
import { loadIsmOfficialCalendarHtml } from "./ismOfficial/client";
import { loadPublishedIsmOfficialReleases } from "./ismOfficial/publishedCalendar";
import { loadNbsOfficialCalendarHtml } from "./nbsOfficialCalendar/client";
import { recordScheduleChange } from "./schedulerAudit";
import {
  isNbsOfficialPackage,
  nbsOfficialReleaseToCalendarEvent,
  nextNbsOfficialReleaseForPackage,
  parseNbsOfficialCalendarPage,
  type NbsOfficialRelease,
} from "./nbsOfficialCalendar/parseCalendar";
import {
  resolvePackageNextRunAt,
  type PackageRunState,
  type PackageScheduleDecision,
} from "./packageScheduleGuard";
import { packageUsesFredReleaseCalendar } from "./fredReleaseCalendar/catalog";
import {
  defaultFredCalendarWindow,
  fetchFredReleaseCalendar,
  type FredReleaseCalendar,
} from "./fredReleaseCalendar/client";
import {
  fredReleaseOccurrencesForPackage,
  fredReleaseToCalendarEvent,
  lastFredReleaseBefore,
  nextFredRelease,
} from "./fredReleaseCalendar/parseCalendar";
import { loadPackageRunStates } from "./packageRunState";

export type CalendarSyncRow = {
  subscriptionId?: string;
  instrumentCode: string;
  packageId?: string;
  packageLabelZh?: string;
  memberCount?: number;
  matched: boolean;
  nextRunAt: Date | null;
  eventTitle?: string;
  releaseAt?: string;
  message?: string;
  syncStatus?: CalendarSyncMeta["status"];
  /** 护栏生效时的原因；未生效（正常跟随日历）为 undefined */
  holdReason?: PackageScheduleDecision["reason"];
};

export type CalendarSyncResult = {
  eventsFetched: number;
  source: string;
  warning?: string;
  fetchFailed: boolean;
  rows: CalendarSyncRow[];
};

function asEconomicCalendarRule(
  rule: ReleaseRule,
): Extract<ReleaseRule, { type: "economic_calendar" }> {
  if (rule.type === "economic_calendar") return rule;
  return defaultEconomicCalendarRule("MONTHLY");
}

function calendarResyncRunAt(from: Date = new Date()): Date {
  const raw = process.env.TE_CALENDAR_RESYNC_HOURS?.trim();
  const hours =
    raw != null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : 24;
  return new Date(from.getTime() + hours * 3_600_000);
}

function patchCalendarRule(
  rule: ReleaseRule,
  patch: {
    calendarMatch?: CalendarMatchSnapshot;
    calendarSync: CalendarSyncMeta;
    clearCalendarMatch?: boolean;
    calendarProvider?: "tradingeconomics" | "ism_official" | "nbs_official" | "fred_release";
  },
): Extract<ReleaseRule, { type: "economic_calendar" }> {
  const base = asEconomicCalendarRule(rule);
  const { calendarMatch: _prev, ...rest } = base;
  return {
    ...rest,
    calendarProvider: patch.calendarProvider ?? base.calendarProvider ?? "tradingeconomics",
    ...(patch.clearCalendarMatch
      ? {}
      : patch.calendarMatch
        ? { calendarMatch: patch.calendarMatch }
        : base.calendarMatch
          ? { calendarMatch: base.calendarMatch }
          : {}),
    calendarSync: patch.calendarSync,
  };
}

function collectCountryCodesFromPackages(
  packages: { calendarSpec: unknown }[],
): string[] {
  const codes = new Set<string>();
  for (const pkg of packages) {
    const spec = calendarSpecForPackageRow({
      id: "",
      calendarSpec: pkg.calendarSpec,
    });
    if (spec) teCountryCodesForSpec(spec).forEach((c) => codes.add(c));
  }
  return [...codes];
}

async function persistSubscription(
  prisma: PrismaClient,
  subId: string,
  data: { releaseRule?: ReleaseRule; nextRunAt: Date | null },
  dryRun?: boolean,
) {
  if (dryRun) return;
  const previous = await prisma.dataSubscription.findUnique({
    where: { id: subId },
    select: { nextRunAt: true },
  });
  await prisma.dataSubscription.update({
    where: { id: subId },
    data: {
      ...(data.releaseRule ? { releaseRule: data.releaseRule as object } : {}),
      nextRunAt: data.nextRunAt,
    },
  });
  const syncStatus = data.releaseRule?.type === "economic_calendar"
    ? data.releaseRule.calendarSync?.status
    : undefined;
  await recordScheduleChange(prisma, {
    subscriptionId: subId,
    previousNextRunAt: previous?.nextRunAt,
    nextRunAt: data.nextRunAt,
    source: "calendar_sync",
    reason: syncStatus ? `calendar_${syncStatus}` : "calendar_schedule_update",
  });
}

async function persistPackageSchedule(
  prisma: PrismaClient,
  packageId: string,
  data: {
    scheduleState: ReleasePackageScheduleState;
    nextRunAt: Date | null;
    /** 护栏决策，写入审计便于事后追查「为什么这一轮没有跟着日历走」 */
    holdReason?: PackageScheduleDecision["reason"];
  },
  dryRun?: boolean,
) {
  if (dryRun) return;
  const previous = await prisma.releasePackage.findUnique({
    where: { id: packageId },
    select: { nextRunAt: true },
  });
  await prisma.releasePackage.update({
    where: { id: packageId },
    data: {
      scheduleState: data.scheduleState as object,
      nextRunAt: data.nextRunAt,
    },
  });
  if (data.nextRunAt != null) {
    await prisma.dataSubscription.updateMany({
      where: { releasePackageId: packageId, enabled: true },
      data: { nextRunAt: data.nextRunAt },
    });
  }
  await recordScheduleChange(prisma, {
    releasePackageId: packageId,
    previousNextRunAt: previous?.nextRunAt,
    nextRunAt: data.nextRunAt,
    source: "calendar_sync",
    reason:
      data.holdReason && data.holdReason !== "calendar"
        ? `calendar_${data.holdReason}`
        : data.scheduleState.calendarSync?.status
          ? `calendar_${data.scheduleState.calendarSync.status}`
          : "calendar_schedule_update",
    metadata: {
      memberSchedulePropagated: data.nextRunAt != null,
      ...(data.holdReason ? { holdReason: data.holdReason } : {}),
    },
  });
}

async function applyCalendarMatchToPackage(
  prisma: PrismaClient,
  pkg: {
    id: string;
    labelZh: string;
    releaseTemplate: unknown;
    nextRunAt?: Date | null;
    scheduleState?: unknown;
    _count?: { members: number };
  },
  memberCount: number,
  nextEvent: EconomicCalendarEvent,
  now: Date,
  options?: {
    dryRun?: boolean;
    calendarSource?: CalendarMatchSnapshot["source"];
    runState?: PackageRunState;
    /** 日历源能给出的「上一次已发生的发布时刻」；TE 给不出，传 undefined 即可 */
    previousReleaseAt?: Date | null;
  },
): Promise<CalendarSyncRow> {
  const template = parsePackageReleaseTemplate(pkg.releaseTemplate);
  const snapshot: CalendarMatchSnapshot = {
    eventId: nextEvent.eventId,
    title: nextEvent.title,
    releaseAt: nextEvent.releaseAt.toISOString(),
    syncedAt: now.toISOString(),
    source: options?.calendarSource ?? "tradingeconomics",
  };
  const scheduleState: ReleasePackageScheduleState = {
    calendarMatch: snapshot,
    calendarSync: {
      status: "matched",
      syncedAt: now.toISOString(),
    },
  };
  const computedNextRunAt = template
    ? nextRunAtFromCalendarRule(
        { ...template, calendarMatch: snapshot, calendarSync: scheduleState.calendarSync },
        now,
      )
    : null;

  // 护栏：日历算出的「下一期」不得把一次该跑而没跑的任务往后推。
  // previousReleaseAt 优先用日历源给的真实上一期发布时刻（FRED 有；TE 没有），
  // 退而求其次用上一轮同步记下的 calendarMatch.releaseAt。
  const previousState = parsePackageScheduleState(pkg.scheduleState);
  const priorMatchReleaseAt = previousState.calendarMatch?.releaseAt
    ? new Date(previousState.calendarMatch.releaseAt)
    : null;
  const previousReleaseAt =
    options?.previousReleaseAt ??
    (priorMatchReleaseAt && !Number.isNaN(priorMatchReleaseAt.getTime())
      ? priorMatchReleaseAt
      : null);

  const decision = resolvePackageNextRunAt({
    computedNextRunAt,
    currentNextRunAt: pkg.nextRunAt ?? null,
    previousReleaseAt,
    runState: options?.runState ?? { lastSuccessAt: null, sourceVerifiedAt: null },
    now,
  });
  const nextRunAt = decision.nextRunAt;

  await persistPackageSchedule(
    prisma,
    pkg.id,
    { scheduleState, nextRunAt, holdReason: decision.reason },
    options?.dryRun,
  );

  return {
    instrumentCode: `pkg:${pkg.id}`,
    packageId: pkg.id,
    packageLabelZh: pkg.labelZh,
    memberCount,
    matched: true,
    nextRunAt,
    eventTitle: nextEvent.title,
    releaseAt: snapshot.releaseAt,
    syncStatus: "matched",
    holdReason: decision.reason === "calendar" ? undefined : decision.reason,
  };
}

async function syncLegacySubscription(
  prisma: PrismaClient,
  sub: {
    id: string;
    releaseRule: unknown;
    releasePackageId: string | null;
    nextRunAt: Date | null;
    enabled: boolean;
    sourceSeriesKey: string;
    instrument: { code: string; metadata: unknown };
    source: { adapterKind: import("@prisma/client").SourceAdapterKind };
  },
  events: EconomicCalendarEvent[],
  fetchFailed: boolean,
  fetchWarning: string | undefined,
  now: Date,
  options?: { dryRun?: boolean },
): Promise<CalendarSyncRow> {
  const rule = parseReleaseRule(sub.releaseRule);

  if (
    !subscriptionEligibleForSchedule({
      subscriptionEnabled: sub.enabled,
      adapterKind: sub.source.adapterKind,
      sourceSeriesKey: sub.sourceSeriesKey,
      metadata: sub.instrument.metadata,
    })
  ) {
    if (!options?.dryRun) {
      await persistSubscription(prisma, sub.id, { nextRunAt: null });
    }
    return {
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: false,
      nextRunAt: null,
      message: "获取方式未确认，不写入下次更新",
      syncStatus: "no_mapping",
    };
  }

  if (!subscriptionUsesCalendarSync(sub.sourceSeriesKey, sub.instrument.code)) {
    return {
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: false,
      nextRunAt: sub.nextRunAt,
      message: "固定间隔探测（无日历）",
      syncStatus: "probe_only",
    };
  }

  if (fetchFailed) {
    const ecRule = asEconomicCalendarRule(rule);
    let nextRunAt = calendarResyncRunAt(now);
    if (ecRule.calendarMatch?.releaseAt) {
      const fromCal = nextRunAtFromCalendarRule(ecRule, now);
      if (fromCal && fromCal > now) nextRunAt = fromCal;
    }
    const newRule = patchCalendarRule(rule, {
      calendarSync: {
        status: "fetch_failed",
        message: fetchWarning?.slice(0, 500),
        syncedAt: now.toISOString(),
      },
    });
    await persistSubscription(prisma, sub.id, { releaseRule: newRule, nextRunAt }, options?.dryRun);
    return {
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: false,
      nextRunAt,
      message: "TE 日历拉取失败，保留已有发布日；否则 24h 后重试日历同步",
      syncStatus: "fetch_failed",
    };
  }

  const spec = calendarSpecForSubscription(sub.sourceSeriesKey, sub.instrument.code);
  if (!spec) {
    return {
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: false,
      nextRunAt: sub.nextRunAt,
      message: "无日历映射",
      syncStatus: "no_mapping",
    };
  }

  const nextEvent = findNextCalendarRelease(events, spec, now);
  if (!nextEvent) {
    const windowDays = calendarWindowDays();
    const nextRunAt = calendarResyncRunAt(now);
    const newRule = patchCalendarRule(rule, {
      clearCalendarMatch: true,
      calendarSync: {
        status: "no_match",
        message: `未来 ${windowDays} 天 TE 日历窗口内未匹配到该指标发布事件`,
        syncedAt: now.toISOString(),
      },
    });
    await persistSubscription(prisma, sub.id, { releaseRule: newRule, nextRunAt }, options?.dryRun);
    return {
      subscriptionId: sub.id,
      instrumentCode: sub.instrument.code,
      matched: false,
      nextRunAt,
      message: `TE 日历 ${windowDays} 天窗口内无下一发布，等待下次日历同步（不频繁拉数）`,
      syncStatus: "no_match",
    };
  }

  const snapshot: CalendarMatchSnapshot = {
    eventId: nextEvent.eventId,
    title: nextEvent.title,
    releaseAt: nextEvent.releaseAt.toISOString(),
    syncedAt: now.toISOString(),
    source: "tradingeconomics",
  };
  const newRule = patchCalendarRule(rule, {
    calendarMatch: snapshot,
    calendarSync: { status: "matched", syncedAt: now.toISOString() },
  });
  const nextRunAt = nextRunAtFromCalendarRule(newRule, now);
  await persistSubscription(
    prisma,
    sub.id,
    { releaseRule: newRule, nextRunAt },
    options?.dryRun,
  );
  return {
    subscriptionId: sub.id,
    instrumentCode: sub.instrument.code,
    matched: true,
    nextRunAt,
    eventTitle: nextEvent.title,
    releaseAt: snapshot.releaseAt,
    syncStatus: "matched",
  };
}

/**
 * 刷新发布包与订阅的 nextRunAt：国家统计局/ISM 使用官网日历，其余使用 TE。
 * 旧函数名保留，避免影响既有 worker/admin 调用方。
 */
export async function syncSubscriptionsFromEconomicCalendars(
  prisma: PrismaClient,
  options?: { subscriptionIds?: string[]; dryRun?: boolean },
): Promise<CalendarSyncResult> {
  await refreshCalendarOverrideCache(prisma);

  const subs = await prisma.dataSubscription.findMany({
    where: {
      enabled: true,
      ...(options?.subscriptionIds?.length
        ? { id: { in: options.subscriptionIds } }
        : {}),
    },
    include: {
      instrument: { select: { code: true, name: true, metadata: true } },
      source: { select: { adapterKind: true } },
    },
  });

  let packageIdsFilter: string[] | undefined;
  if (options?.subscriptionIds?.length) {
    const pkgIds = [
      ...new Set(
        subs.map((s) => s.releasePackageId).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (pkgIds.length) packageIdsFilter = pkgIds;
  }

  const allPackages = await loadEnabledReleasePackages(prisma);
  const packages = packageIdsFilter
    ? allPackages.filter((p) => packageIdsFilter!.includes(p.id))
    : allPackages;

  const memberCounts = await prisma.releasePackageMember.groupBy({
    by: ["packageId"],
    _count: { instrumentId: true },
    ...(packageIdsFilter ? { where: { packageId: { in: packageIdsFilter } } } : {}),
  });
  const countByPackage = new Map(memberCounts.map((r) => [r.packageId, r._count.instrumentId]));

  let ismReleases: IsmOfficialRelease[] | null = null;
  let ismCalWarning: string | undefined;
  if (packages.some((pkg) => packageIdToIsmKind(pkg.id) != null)) {
    try {
      const html = await loadIsmOfficialCalendarHtml();
      ismReleases = parseIsmOfficialCalendarPage(html);
    } catch (err) {
      ismReleases = loadPublishedIsmOfficialReleases();
      ismCalWarning = `${err instanceof Error ? err.message : String(err)}；改用仓库内官网年历副本`;
    }
  }

  let nbsReleases: NbsOfficialRelease[] | null = null;
  let nbsCalWarning: string | undefined;
  if (packages.some((pkg) => pkg.agencyId === "cn-nbs")) {
    try {
      const html = await loadNbsOfficialCalendarHtml();
      nbsReleases = parseNbsOfficialCalendarPage(html);
    } catch (err) {
      nbsCalWarning = err instanceof Error ? err.message : String(err);
    }
  }

  // FRED 发布日历：覆盖全部 sched_fred_* 发布包（美国 60 个包 / 314 条成员）。
  // 与 TE 相比它是官方 JSON API、时刻不依赖 cookie 时区，且同时给出过去的发布日，
  // 从而支持「上一期漏抓 → 立即补」。
  let fredCalendar: FredReleaseCalendar | null = null;
  let fredCalWarning: string | undefined;
  const packagesUsingFred = packages.filter((pkg) => packageUsesFredReleaseCalendar(pkg.id));
  if (packagesUsingFred.length > 0) {
    try {
      fredCalendar = await fetchFredReleaseCalendar(defaultFredCalendarWindow());
    } catch (err) {
      fredCalWarning = err instanceof Error ? err.message : String(err);
    }
  }

  const window = defaultCalendarWindow();
  const packagesUsingTe = packages.filter(
    (pkg) =>
      pkg.agencyId !== "cn-nbs" &&
      packageIdToIsmKind(pkg.id) == null &&
      !(fredCalendar && packageUsesFredReleaseCalendar(pkg.id)),
  );
  const legacySubscriptions = subs.filter((sub) => !sub.releasePackageId);
  const countryCodes = [
    ...new Set([
      ...collectCountryCodesFromPackages(packagesUsingTe),
      ...collectCountryCodesFromSubscriptions(legacySubscriptions),
    ]),
  ];
  const needsTeCalendar = packagesUsingTe.length > 0 || legacySubscriptions.length > 0;
  const fetchResult = needsTeCalendar
    ? await fetchTradingEconomicsCalendar({
        ...window,
        countryCodes: countryCodes.length ? countryCodes : undefined,
      })
    : { events: [], source: "not_requested" };

  const events = fetchResult.events;
  const fetchFailed = events.length === 0 && Boolean(fetchResult.warning);
  const rows: CalendarSyncRow[] = [];
  const now = new Date();
  const runStates = await loadPackageRunStates(prisma);
  const runStateFor = (packageId: string): PackageRunState =>
    runStates.get(packageId) ?? { lastSuccessAt: null, sourceVerifiedAt: null };

  for (const pkg of packages) {
    const memberCount = countByPackage.get(pkg.id) ?? 0;

    if (fredCalendar && packageUsesFredReleaseCalendar(pkg.id)) {
      const occurrences = fredReleaseOccurrencesForPackage(fredCalendar, pkg.id);
      const next = nextFredRelease(occurrences, now);
      if (next) {
        rows.push(
          await applyCalendarMatchToPackage(prisma, pkg, memberCount, fredReleaseToCalendarEvent(next), now, {
            dryRun: options?.dryRun,
            calendarSource: "fred_release",
            runState: runStateFor(pkg.id),
            previousReleaseAt: lastFredReleaseBefore(occurrences, now)?.releaseAt ?? null,
          }),
        );
        continue;
      }
      // 窗口内没有下一次发布（罕见：不定期 release）——不改动现有排期，
      // 交给下面的 TE / fallback 分支，避免把已到期的探测点推走。
    }
    if (pkg.agencyId === "cn-nbs") {
      const template = parsePackageReleaseTemplate(pkg.releaseTemplate);
      if (!template || !isNbsOfficialPackage(pkg.id)) {
        rows.push({
          instrumentCode: `pkg:${pkg.id}`,
          packageId: pkg.id,
          packageLabelZh: pkg.labelZh,
          memberCount,
          matched: false,
          nextRunAt: pkg.nextRunAt,
          message: "国家统计局官网日历映射无效",
          syncStatus: "no_mapping",
        });
        continue;
      }

      if (!nbsReleases) {
        const scheduleState: ReleasePackageScheduleState = {
          calendarSync: {
            status: "fetch_failed",
            message: nbsCalWarning?.slice(0, 500),
            syncedAt: now.toISOString(),
          },
        };
        let nextRunAt = calendarResyncRunAt(now);
        const previousState = parsePackageScheduleState(pkg.scheduleState);
        if (previousState.calendarMatch?.releaseAt) {
          const fromCalendar = nextRunAtFromCalendarRule(
            {
              ...template,
              calendarMatch: previousState.calendarMatch,
              calendarSync: scheduleState.calendarSync,
            },
            now,
          );
          if (fromCalendar && fromCalendar > now) nextRunAt = fromCalendar;
        }
        await persistPackageSchedule(
          prisma,
          pkg.id,
          { scheduleState, nextRunAt },
          options?.dryRun,
        );
        rows.push({
          instrumentCode: `pkg:${pkg.id}`,
          packageId: pkg.id,
          packageLabelZh: pkg.labelZh,
          memberCount,
          matched: false,
          nextRunAt,
          message: "国家统计局官网日历拉取失败，保留已有未来发布日或 24h 后重试",
          syncStatus: "fetch_failed",
        });
        continue;
      }

      const nextOfficial = nextNbsOfficialReleaseForPackage(nbsReleases, pkg.id, now);
      if (nextOfficial) {
        rows.push(
          await applyCalendarMatchToPackage(
            prisma,
            pkg,
            memberCount,
            nbsOfficialReleaseToCalendarEvent(nextOfficial),
            now,
            {
              dryRun: options?.dryRun,
              calendarSource: "nbs_official",
              runState: runStateFor(pkg.id),
            },
          ),
        );
        continue;
      }

      const scheduleState: ReleasePackageScheduleState = {
        calendarSync: {
          status: "no_match",
          message: "国家统计局本年官网日历内没有下一次发布；等待年度日历更新",
          syncedAt: now.toISOString(),
        },
      };
      const previousState = parsePackageScheduleState(pkg.scheduleState);
      const fallbackNextRunAt =
        nextRunAtFromCalendarRule(
          { ...template, calendarSync: scheduleState.calendarSync },
          now,
        ) ?? calendarResyncRunAt(now);
      const nextRunAt =
        previousState.calendarSync?.status === "no_match" && pkg.nextRunAt
          ? pkg.nextRunAt
          : fallbackNextRunAt;
      await persistPackageSchedule(
        prisma,
        pkg.id,
        { scheduleState, nextRunAt },
        options?.dryRun,
      );
      rows.push({
        instrumentCode: `pkg:${pkg.id}`,
        packageId: pkg.id,
        packageLabelZh: pkg.labelZh,
        memberCount,
        matched: false,
        nextRunAt,
        message: "国家统计局本年官网日历内无下一发布，保留低频兜底探测",
        syncStatus: "no_match",
      });
      continue;
    }

    const ismKind = packageIdToIsmKind(pkg.id);
    if (ismKind && ismReleases) {
      const nextOfficial = nextIsmOfficialRelease(ismReleases, ismKind, now);
      if (nextOfficial) {
        rows.push(
          await applyCalendarMatchToPackage(
            prisma,
            pkg,
            memberCount,
            ismOfficialReleaseToCalendarEvent(nextOfficial),
            now,
            {
              dryRun: options?.dryRun,
              calendarSource: "ism_official",
              runState: runStateFor(pkg.id),
            },
          ),
        );
        continue;
      }
    }

    const spec = calendarSpecForPackageRow(pkg);
    const template = parsePackageReleaseTemplate(pkg.releaseTemplate);

    if (!spec || !template) {
      rows.push({
        instrumentCode: `pkg:${pkg.id}`,
        packageId: pkg.id,
        packageLabelZh: pkg.labelZh,
        memberCount,
        matched: false,
        nextRunAt: pkg.nextRunAt,
        message: "发布包日历配置无效",
        syncStatus: "no_mapping",
      });
      continue;
    }

    if (fetchFailed) {
      const scheduleState: ReleasePackageScheduleState = {
        calendarSync: {
          status: "fetch_failed",
          message: fetchResult.warning?.slice(0, 500),
          syncedAt: now.toISOString(),
        },
      };
      let nextRunAt = calendarResyncRunAt(now);
      const prev = pkg.scheduleState as ReleasePackageScheduleState | null;
      if (prev?.calendarMatch?.releaseAt && template) {
        const fromCal = nextRunAtFromCalendarRule(
          {
            ...template,
            calendarMatch: prev.calendarMatch,
            calendarSync: scheduleState.calendarSync,
          },
          now,
        );
        if (fromCal && fromCal > now) nextRunAt = fromCal;
      }
      await persistPackageSchedule(
        prisma,
        pkg.id,
        { scheduleState, nextRunAt },
        options?.dryRun,
      );
      rows.push({
        instrumentCode: `pkg:${pkg.id}`,
        packageId: pkg.id,
        packageLabelZh: pkg.labelZh,
        memberCount,
        matched: false,
        nextRunAt,
        message: "TE 日历拉取失败",
        syncStatus: "fetch_failed",
      });
      continue;
    }

    const nextEvent = findNextCalendarRelease(events, spec, now);
    if (!nextEvent) {
      const windowDays = calendarWindowDays();
      const scheduleState: ReleasePackageScheduleState = {
        calendarSync: {
          status: "no_match",
          message: `未来 ${windowDays} 天 TE 日历窗口内未匹配到该发布包事件`,
          syncedAt: now.toISOString(),
        },
      };
      const previousState = parsePackageScheduleState(pkg.scheduleState);
      // sync-calendar 每小时运行。若每次 no_match 都从“现在”重算 fallback，
      // 12 小时后的探测点会被永久向后推，worker 永远等不到到期订阅。
      // 首次进入 no_match 时初始化 fallback；之后保持既有探测点（包括已到期的
      // 时间），由 worker 成功执行后再推进下一次探测。
      const fallbackNextRunAt =
        nextRunAtFromCalendarRule(
          { ...template, calendarSync: scheduleState.calendarSync },
          now,
        ) ?? calendarResyncRunAt(now);
      const nextRunAt =
        previousState.calendarSync?.status === "no_match" && pkg.nextRunAt
          ? pkg.nextRunAt
          : fallbackNextRunAt;
      await persistPackageSchedule(
        prisma,
        pkg.id,
        { scheduleState, nextRunAt },
        options?.dryRun,
      );
      rows.push({
        instrumentCode: `pkg:${pkg.id}`,
        packageId: pkg.id,
        packageLabelZh: pkg.labelZh,
        memberCount,
        matched: false,
        nextRunAt,
        message: `TE 日历 ${windowDays} 天窗口内无下一发布（${pkg.labelZh}）`,
        syncStatus: "no_match",
      });
      continue;
    }

    rows.push(
      await applyCalendarMatchToPackage(prisma, pkg, memberCount, nextEvent, now, {
        ...options,
        runState: runStateFor(pkg.id),
      }),
    );
  }

  for (const sub of legacySubscriptions) {
    rows.push(
      await syncLegacySubscription(
        prisma,
        sub,
        events,
        fetchFailed,
        fetchResult.warning,
        now,
        options,
      ),
    );
  }

  return {
    eventsFetched:
      events.length +
      (nbsReleases?.length ?? 0) +
      (ismReleases?.length ?? 0) +
      (fredCalendar?.rowCount ?? 0),
    source:
      [
        fredCalendar ? "FRED发布日历" : null,
        nbsReleases ? "国家统计局官网" : null,
        ismReleases ? "ISM官网" : null,
        needsTeCalendar ? fetchResult.source : null,
      ]
        .filter(Boolean)
        .join(" + ") || "no_calendar_requested",
    warning: [
      fredCalWarning ? `FRED 发布日历：${fredCalWarning}（该批发布包本轮回退 TE）` : null,
      fredCalendar?.failedReleaseIds.length
        ? `FRED 发布日历：release ${fredCalendar.failedReleaseIds.join("/")} 拉取失败，相关发布包本轮回退 TE`
        : null,
      nbsCalWarning ? `国家统计局官网日历：${nbsCalWarning}` : null,
      ismCalWarning ? `ISM官网日历：${ismCalWarning}` : null,
      fetchResult.warning,
    ]
      .filter(Boolean)
      .join("；") || undefined,
    fetchFailed,
    rows,
  };
}

/** @deprecated 使用 syncSubscriptionsFromEconomicCalendars */
export const syncSubscriptionsFromTradingEconomicsCalendar =
  syncSubscriptionsFromEconomicCalendars;

/** @deprecated 使用 syncSubscriptionsFromEconomicCalendars */
export const syncSubscriptionsFromInvestingCalendar =
  syncSubscriptionsFromEconomicCalendars;

/** 拉取成功后：若已过发布窗口则尽快安排下一次日历同步探测 */
export function scheduleAfterSuccessfulFetch(
  rule: ReleaseRule,
  hadNewData: boolean,
  from: Date = new Date(),
): Date | null {
  if (rule.type !== "economic_calendar") {
    return computeNextRunAt(rule, from);
  }

  const match = rule.calendarMatch;
  if (!match?.releaseAt) {
    return rule.fallback ? computeNextRunAt(rule.fallback, from) : null;
  }

  const releaseAt = new Date(match.releaseAt);
  const delayed = new Date(releaseAt.getTime() + rule.releaseDelayMinutes * 60_000);

  if (from < delayed) {
    return delayed;
  }

  return new Date(from.getTime() + rule.postReleaseProbeHours * 3_600_000);
}

export function filterEventsForDebug(events: EconomicCalendarEvent[], limit = 20) {
  return events.slice(0, limit).map((e) => ({
    id: e.eventId,
    title: e.title,
    country: e.countryCode,
    at: e.releaseAt.toISOString(),
  }));
}

export { stripCalendarStateFromSubscriptionRule };

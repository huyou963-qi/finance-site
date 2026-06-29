import {
  FetchRunStatus,
  SourceAdapterKind,
  type DataSubscription,
  type DataSource,
  type PrismaClient,
} from "@prisma/client";
import { fetchBisIncremental } from "./adapters/bisAdapter";
import { fetchFredIncremental } from "./adapters/fredAdapter";
import {
  fetchOverviewIncremental,
  overviewTemplateForInstrument,
} from "./adapters/overviewXlsxAdapter";
import { fetchWorldBankIncremental } from "./adapters/worldbankAdapter";
import { scheduleAfterSuccessfulFetch, syncSubscriptionsFromTradingEconomicsCalendar } from "./applyCalendarSchedules";
import {
  computeBackoffRunAt,
  computeNextRunAt,
  parseReleaseRule,
} from "./releaseRule";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";
import {
  applyFredTransform,
  fredTransformForInstrument,
} from "./fredTransform";
import { fetchFredCompositeIncremental } from "./fredComposite";
import { fiscalCompositeSpec } from "./fiscalCompositeFred";
import { usovCompositeSpec } from "./usovCompositeFred";
import type { SubscriptionRunResult } from "./types";
import {
  filterPointsFrom,
  maxObsDate,
  observationWindowForFetch,
  upsertMacroObservations,
} from "./upsertObservations";
import {
  effectiveReleaseRule,
  parsePackageScheduleState,
} from "./releasePackageStore";

export type SubscriptionWithRelations = DataSubscription & {
  source: DataSource;
  instrument: { id: string; code: string; name: string; metadata?: unknown };
  releasePackage?: {
    id: string;
    releaseTemplate: unknown;
    scheduleState: unknown;
    nextRunAt: Date | null;
  } | null;
};

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function minIntervalMs(source: DataSource): number {
  const rl = source.rateLimit as { minIntervalMs?: number } | null;
  return typeof rl?.minIntervalMs === "number" ? rl.minIntervalMs : 500;
}

export async function runDataSubscription(
  prisma: PrismaClient,
  sub: SubscriptionWithRelations,
  options?: { force?: boolean },
): Promise<SubscriptionRunResult> {
  const now = new Date();
  if (!sub.enabled) {
    return { status: "skipped", rowsUpserted: 0, rowsSkipped: 0, error: "disabled" };
  }

  if (
    !options?.force &&
    !subscriptionEligibleForSchedule({
      subscriptionEnabled: sub.enabled,
      adapterKind: sub.source.adapterKind,
      sourceSeriesKey: sub.sourceSeriesKey,
      metadata: sub.instrument.metadata,
    })
  ) {
    return {
      status: "skipped",
      rowsUpserted: 0,
      rowsSkipped: 0,
      error: "acquisition_not_confirmed",
    };
  }

  if (!options?.force && sub.nextRunAt && sub.nextRunAt > now) {
    return { status: "skipped", rowsUpserted: 0, rowsSkipped: 0, error: "not_due" };
  }

  const effectiveRule = sub.releasePackage
    ? effectiveReleaseRule(sub.releaseRule, sub.releasePackage)
    : parseReleaseRule(sub.releaseRule);

  const rule = effectiveRule;
  if (
    !options?.force &&
    rule.type === "economic_calendar" &&
    !rule.calendarMatch?.releaseAt
  ) {
    return {
      status: "skipped",
      rowsUpserted: 0,
      rowsSkipped: 0,
      error: "awaiting_calendar_match",
    };
  }

  const run = await prisma.fetchRun.create({
    data: {
      subscriptionId: sub.id,
      startedAt: now,
      status: FetchRunStatus.FAILED,
    },
  });

  if (rule.type === "manual" && !options?.force) {
    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: FetchRunStatus.SKIPPED,
        error: "manual subscription",
      },
    });
    return { status: "skipped", rowsUpserted: 0, rowsSkipped: 0, error: "manual" };
  }

  try {
    let fetchResult;
    const transform = fredTransformForInstrument(sub.instrument.code);
    const { fetchStart, persistStart } = observationWindowForFetch(
      sub.lastObsDate,
      sub.revisionLookback,
      { yoyTransform: transform === "yoy_pct" },
    );

    if (sub.source.adapterKind === SourceAdapterKind.FRED_API) {
      const apiKey = process.env.FRED_API_KEY?.trim();
      if (!apiKey) throw new Error("未配置 FRED_API_KEY");
      await sleep(minIntervalMs(sub.source));
      const composite =
        usovCompositeSpec(sub.instrument.code) ?? fiscalCompositeSpec(sub.instrument.code);
      if (composite) {
        fetchResult = await fetchFredCompositeIncremental(composite, apiKey, fetchStart);
      } else {
        fetchResult = await fetchFredIncremental(
          sub.sourceSeriesKey,
          apiKey,
          fetchStart,
        );
      }
    } else if (sub.source.adapterKind === SourceAdapterKind.REST_API) {
      await sleep(minIntervalMs(sub.source));
      const scrape =
        sub.instrument.metadata &&
        typeof sub.instrument.metadata === "object" &&
        (sub.instrument.metadata as Record<string, unknown>).scrape;
      if (scrape && typeof scrape === "object") {
        const scrapeObj = scrape as Record<string, unknown>;
        if (scrapeObj.provider === "tradingeconomics_ism") {
          const { fetchTradingEconomicsIsmIncremental } = await import(
            "./adapters/tradingEconomicsIsmAdapter"
          );
          fetchResult = await fetchTradingEconomicsIsmIncremental(
            sub.instrument.metadata,
            sub.instrument.code,
            fetchStart,
          );
        } else if (scrapeObj.provider === "tradingeconomics_ism_svc") {
          const { fetchTradingEconomicsIsmSvcIncremental } = await import(
            "./adapters/tradingEconomicsIsmSvcAdapter"
          );
          fetchResult = await fetchTradingEconomicsIsmSvcIncremental(
            sub.instrument.metadata,
            sub.instrument.code,
            fetchStart,
          );
        } else {
          const { fetchWebScrapeIncremental } = await import("./adapters/webScrapeAdapter");
          fetchResult = await fetchWebScrapeIncremental(
            sub.instrument.metadata,
            sub.instrument.code,
            fetchStart,
          );
        }
      } else if (sub.sourceId === "estat-jp") {
        const { fetchEStatIncremental } = await import("./adapters/eStatAdapter");
        fetchResult = await fetchEStatIncremental(sub.sourceSeriesKey, fetchStart);
      } else if (sub.sourceId === "treasury-fiscal-data") {
        const { fetchTreasuryFiscalIncremental } = await import(
          "./adapters/treasuryFiscalDataAdapter"
        );
        fetchResult = await fetchTreasuryFiscalIncremental(sub.sourceSeriesKey, fetchStart);
      } else if (sub.sourceId === "cftc-cot") {
        const { fetchCftcCotIncremental } = await import("./adapters/cftcCotAdapter");
        fetchResult = await fetchCftcCotIncremental(sub.instrument.metadata, fetchStart);
      } else {
        fetchResult = await fetchBisIncremental(sub.sourceSeriesKey, fetchStart);
      }
    } else if (sub.source.adapterKind === SourceAdapterKind.WORLD_BANK_API) {
      await sleep(minIntervalMs(sub.source));
      fetchResult = await fetchWorldBankIncremental(sub.sourceSeriesKey, fetchStart);
    } else if (sub.source.adapterKind === SourceAdapterKind.BULK_FILE) {
      const template = overviewTemplateForInstrument(sub.instrument.code);
      if (!template) {
        throw new Error(`BULK_FILE 未识别仪器 ${sub.instrument.code}`);
      }
      fetchResult = fetchOverviewIncremental(template, sub.instrument.code, fetchStart);
    } else if (sub.source.adapterKind === SourceAdapterKind.MANUAL) {
      throw new Error("MANUAL 订阅需人工更新或通过 sync_one --force 跳过");
    } else {
      throw new Error(`尚未实现适配器：${sub.source.adapterKind}`);
    }

    if (transform !== "none") {
      fetchResult = {
        ...fetchResult,
        points: filterPointsFrom(
          applyFredTransform(fetchResult.points, transform),
          persistStart,
        ),
      };
    }

    const { upserted, skipped } = await upsertMacroObservations(
      prisma,
      sub.instrumentId,
      fetchResult.points,
    );

    const newMax = maxObsDate(fetchResult.points);
    const lastObs =
      newMax && sub.lastObsDate && newMax <= sub.lastObsDate
        ? sub.lastObsDate
        : newMax ?? sub.lastObsDate;

    const sourceLagDays =
      fetchResult.sourceLatestObsDate && lastObs
        ? diffDays(fetchResult.sourceLatestObsDate, lastObs)
        : null;

    const noNewData = fetchResult.points.length === 0;
    const status =
      upserted > 0
        ? FetchRunStatus.SUCCESS
        : noNewData
          ? FetchRunStatus.SKIPPED
          : FetchRunStatus.PARTIAL;

    const hadNewData = upserted > 0;
    const sourceCaughtUp =
      sourceLagDays != null &&
      sourceLagDays <= 0 &&
      (status === FetchRunStatus.SKIPPED || status === FetchRunStatus.SUCCESS);

    let updatedRule = rule;
    if (rule.type === "economic_calendar" && sourceCaughtUp) {
      updatedRule = {
        ...rule,
        sourceSync: {
          status: "current",
          verifiedAt: new Date().toISOString(),
          localObsDate: lastObs?.toISOString().slice(0, 10),
          sourceLatestObsDate: fetchResult.sourceLatestObsDate?.toISOString().slice(0, 10),
          fetchStatus: status,
        },
      };
    }

    const releaseRuleChanged = updatedRule !== rule;

    let nextRunAt =
      scheduleAfterSuccessfulFetch(updatedRule, hadNewData, new Date()) ??
      computeNextRunAt(updatedRule, new Date());

    const shouldRefreshCalendar =
      rule.type === "economic_calendar" &&
      (hadNewData || status === FetchRunStatus.SUCCESS || sourceCaughtUp);

    if (shouldRefreshCalendar) {
      if (releaseRuleChanged) {
        if (sub.releasePackageId) {
          const scheduleState = parsePackageScheduleState(sub.releasePackage?.scheduleState);
          if (updatedRule.type === "economic_calendar" && updatedRule.sourceSync) {
            await prisma.releasePackage.update({
              where: { id: sub.releasePackageId },
              data: {
                scheduleState: {
                  ...scheduleState,
                  sourceSync: updatedRule.sourceSync,
                } as object,
              },
            });
          }
        } else {
          await prisma.dataSubscription.update({
            where: { id: sub.id },
            data: { releaseRule: updatedRule as object },
          });
        }
      }
      await syncSubscriptionsFromTradingEconomicsCalendar(prisma, {
        subscriptionIds: [sub.id],
      });
      const refreshed = await prisma.dataSubscription.findUnique({
        where: { id: sub.id },
        select: { nextRunAt: true },
      });
      if (refreshed?.nextRunAt) nextRunAt = refreshed.nextRunAt;
    }

    await prisma.dataSubscription.update({
      where: { id: sub.id },
      data: {
        lastSuccessAt: new Date(),
        lastObsDate: lastObs ?? undefined,
        nextRunAt,
        retryCount: 0,
        lastError: null,
        ...(releaseRuleChanged && !shouldRefreshCalendar && !sub.releasePackageId
          ? { releaseRule: updatedRule as object }
          : {}),
      },
    });

    if (sub.releasePackageId && nextRunAt) {
      await prisma.releasePackage.update({
        where: { id: sub.releasePackageId },
        data: { nextRunAt },
      });
      await prisma.dataSubscription.updateMany({
        where: {
          releasePackageId: sub.releasePackageId,
          id: { not: sub.id },
          enabled: true,
        },
        data: { nextRunAt },
      });
    }

    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status,
        rowsUpserted: upserted,
        rowsSkipped: skipped + fetchResult.skippedInvalid,
        sourceLagDays,
        metadata: {
          fetchStart,
          persistStart,
          fetched: fetchResult.points.length,
        },
      },
    });

    return {
      status:
        status === FetchRunStatus.SUCCESS
          ? "success"
          : status === FetchRunStatus.SKIPPED
            ? "skipped"
            : "partial",
      rowsUpserted: upserted,
      rowsSkipped: skipped + fetchResult.skippedInvalid,
      sourceLagDays,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const retryCount = sub.retryCount + 1;
    const nextRunAt = computeBackoffRunAt(retryCount);

    await prisma.dataSubscription.update({
      where: { id: sub.id },
      data: {
        retryCount,
        lastError: message.slice(0, 2000),
        nextRunAt,
      },
    });

    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: FetchRunStatus.FAILED,
        error: message.slice(0, 2000),
      },
    });

    return {
      status: "failed",
      rowsUpserted: 0,
      rowsSkipped: 0,
      error: message,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 查询到期订阅（含关联；仅获取方式已确认者） */
export async function listDueSubscriptions(
  prisma: PrismaClient,
  limit: number,
  options?: { forceAll?: boolean },
) {
  const now = new Date();
  const subs = await prisma.dataSubscription.findMany({
    where: {
      enabled: true,
      ...(options?.forceAll
        ? {}
        : {
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
          }),
    },
    orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
    take: Math.max(limit * 8, limit),
    include: {
      source: true,
      instrument: { select: { id: true, code: true, name: true, metadata: true } },
      releasePackage: {
        select: {
          id: true,
          releaseTemplate: true,
          scheduleState: true,
          nextRunAt: true,
        },
      },
    },
  });

  return subs
    .filter((sub) =>
      subscriptionEligibleForSchedule({
        subscriptionEnabled: sub.enabled,
        adapterKind: sub.source.adapterKind,
        sourceSeriesKey: sub.sourceSeriesKey,
        metadata: sub.instrument.metadata,
      }),
    )
    .slice(0, limit);
}

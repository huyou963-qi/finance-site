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
import { scheduleAfterSuccessfulFetch } from "./applyCalendarSchedules";
import {
  computeBackoffRunAt,
  computeNextRunAt,
  parseReleaseRule,
} from "./releaseRule";
import {
  applyFredTransform,
  fredTransformForInstrument,
} from "./fredTransform";
import { fetchFredCompositeIncremental } from "./fredComposite";
import { usovCompositeSpec } from "./usovCompositeFred";
import type { SubscriptionRunResult } from "./types";
import {
  maxObsDate,
  observationStartDate,
  upsertMacroObservations,
} from "./upsertObservations";

export type SubscriptionWithRelations = DataSubscription & {
  source: DataSource;
  instrument: { id: string; code: string; name: string };
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

  if (!options?.force && sub.nextRunAt && sub.nextRunAt > now) {
    return { status: "skipped", rowsUpserted: 0, rowsSkipped: 0, error: "not_due" };
  }

  const run = await prisma.fetchRun.create({
    data: {
      subscriptionId: sub.id,
      startedAt: now,
      status: FetchRunStatus.FAILED,
    },
  });

  const rule = parseReleaseRule(sub.releaseRule);
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
    const obsStart = observationStartDate(sub.lastObsDate, sub.revisionLookback);

    if (sub.source.adapterKind === SourceAdapterKind.FRED_API) {
      const apiKey = process.env.FRED_API_KEY?.trim();
      if (!apiKey) throw new Error("未配置 FRED_API_KEY");
      await sleep(minIntervalMs(sub.source));
      const composite = usovCompositeSpec(sub.instrument.code);
      if (composite) {
        fetchResult = await fetchFredCompositeIncremental(composite, apiKey, obsStart);
      } else {
        fetchResult = await fetchFredIncremental(
          sub.sourceSeriesKey,
          apiKey,
          obsStart,
        );
      }
    } else if (sub.source.adapterKind === SourceAdapterKind.REST_API) {
      await sleep(minIntervalMs(sub.source));
      if (sub.sourceId === "estat-jp") {
        const { fetchEStatIncremental } = await import("./adapters/eStatAdapter");
        fetchResult = await fetchEStatIncremental(sub.sourceSeriesKey, obsStart);
      } else {
        fetchResult = await fetchBisIncremental(sub.sourceSeriesKey, obsStart);
      }
    } else if (sub.source.adapterKind === SourceAdapterKind.WORLD_BANK_API) {
      await sleep(minIntervalMs(sub.source));
      fetchResult = await fetchWorldBankIncremental(sub.sourceSeriesKey, obsStart);
    } else if (sub.source.adapterKind === SourceAdapterKind.BULK_FILE) {
      const template = overviewTemplateForInstrument(sub.instrument.code);
      if (!template) {
        throw new Error(`BULK_FILE 未识别仪器 ${sub.instrument.code}`);
      }
      fetchResult = fetchOverviewIncremental(template, sub.instrument.code, obsStart);
    } else if (sub.source.adapterKind === SourceAdapterKind.MANUAL) {
      throw new Error("MANUAL 订阅需人工更新或通过 sync_one --force 跳过");
    } else {
      throw new Error(`尚未实现适配器：${sub.source.adapterKind}`);
    }

    const transform = fredTransformForInstrument(sub.instrument.code);
    if (transform !== "none") {
      fetchResult = {
        ...fetchResult,
        points: applyFredTransform(fetchResult.points, transform),
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
    const nextRunAt =
      scheduleAfterSuccessfulFetch(rule, hadNewData, new Date()) ??
      computeNextRunAt(rule, new Date());
    await prisma.dataSubscription.update({
      where: { id: sub.id },
      data: {
        lastSuccessAt: new Date(),
        lastObsDate: lastObs ?? undefined,
        nextRunAt,
        retryCount: 0,
        lastError: null,
      },
    });

    await prisma.fetchRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status,
        rowsUpserted: upserted,
        rowsSkipped: skipped + fetchResult.skippedInvalid,
        sourceLagDays,
        metadata: {
          observationStart: obsStart,
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

/** 查询到期订阅（含关联） */
export async function listDueSubscriptions(
  prisma: PrismaClient,
  limit: number,
  options?: { forceAll?: boolean },
) {
  const now = new Date();
  return prisma.dataSubscription.findMany({
    where: {
      enabled: true,
      ...(options?.forceAll
        ? {}
        : {
            OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
          }),
    },
    orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
    take: limit,
    include: {
      source: true,
      instrument: { select: { id: true, code: true, name: true } },
    },
  });
}

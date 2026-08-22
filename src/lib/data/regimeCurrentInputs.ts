import { prisma } from "@/lib/prisma";
import { REGIME_VINTAGE_INPUT_CODES } from "@/lib/data/macroObservationVintages";
import {
  runDataSubscription,
  type SubscriptionWithRelations,
} from "@/lib/data/scheduler/runSubscription";
import { REGIME_NOWCAST_INPUT_CODES } from "@/lib/quant/macroRegime";

export const REGIME_CURRENT_INPUT_CODES = [
  ...new Set([...REGIME_VINTAGE_INPUT_CODES, ...REGIME_NOWCAST_INPUT_CODES]),
] as const;

const HIGH_FREQUENCY_CODES = new Set(REGIME_NOWCAST_INPUT_CODES);
const HIGH_FREQUENCY_CHECK_HOURS = 30;
const MONTHLY_CHECK_HOURS = 7 * 24;

export type SyncRegimeCurrentInputsResult = {
  checkedAt: string;
  prioritizedSubscriptions: number;
  trackedSubscriptions: number;
  skippedFresh: number;
  success: number;
  failed: number;
  series: Array<{
    code: string;
    checkCadence: "daily" | "weekly";
    previousSuccessAt: string | null;
    status: "success" | "skipped" | "partial" | "failed";
    rowsUpserted: number;
    error: string | null;
  }>;
};

/** 只提升较低优先级，不覆盖其他域已经设置的更高全局优先级。 */
export async function prioritizeRegimeDataSubscriptions(priority = 60): Promise<number> {
  const instruments = await prisma.instrument.findMany({
    where: { code: { in: [...REGIME_CURRENT_INPUT_CODES] } },
    select: { id: true },
  });
  if (!instruments.length) return 0;
  const result = await prisma.dataSubscription.updateMany({
    where: {
      instrumentId: { in: instruments.map((item) => item.id) },
      priority: { lt: priority },
    },
    data: { priority },
  });
  return result.count;
}

export function regimeInputNeedsFreshnessCheck(options: {
  code: string;
  lastSuccessAt: Date | null;
  now: Date;
}): boolean {
  if (!options.lastSuccessAt) return true;
  const maxAgeHours = HIGH_FREQUENCY_CODES.has(options.code)
    ? HIGH_FREQUENCY_CHECK_HOURS
    : MONTHLY_CHECK_HOURS;
  return options.now.getTime() - options.lastSuccessAt.getTime() >= maxAgeHours * 3_600_000;
}

/**
 * Regime 输入的新鲜度兜底：日频每天、月频每周最多补检一次。它只调用统一 subscription
 * runner/adapter/writer，并保留原 nextRunAt，因此不会因为单序列补检而推进整个发布包。
 */
export async function syncRegimeCurrentInputs(options: {
  now?: Date;
  priority?: number;
} = {}): Promise<SyncRegimeCurrentInputsResult> {
  const now = options.now ?? new Date();
  const prioritizedSubscriptions = await prioritizeRegimeDataSubscriptions(options.priority);
  const subscriptions = await prisma.dataSubscription.findMany({
    where: { enabled: true, instrument: { code: { in: [...REGIME_CURRENT_INPUT_CODES] } } },
    orderBy: { instrument: { code: "asc" } },
    include: {
      source: true,
      instrument: { select: { id: true, code: true, name: true, metadata: true } },
      releasePackage: {
        select: {
          id: true,
          labelZh: true,
          releaseTemplate: true,
          scheduleState: true,
          nextRunAt: true,
        },
      },
    },
  });
  const due = subscriptions.filter((sub) => regimeInputNeedsFreshnessCheck({
    code: sub.instrument.code,
    lastSuccessAt: sub.lastSuccessAt,
    now,
  }));
  const series: SyncRegimeCurrentInputsResult["series"] = [];
  for (const sub of due) {
    const result = await runDataSubscription(prisma, sub as SubscriptionWithRelations, {
      force: true,
      skipCalendarRefresh: true,
      preserveNextRunAt: true,
    });
    series.push({
      code: sub.instrument.code,
      checkCadence: HIGH_FREQUENCY_CODES.has(sub.instrument.code) ? "daily" : "weekly",
      previousSuccessAt: sub.lastSuccessAt?.toISOString() ?? null,
      status: result.status,
      rowsUpserted: result.rowsUpserted,
      error: result.error ?? null,
    });
  }
  return {
    checkedAt: now.toISOString(),
    prioritizedSubscriptions,
    trackedSubscriptions: subscriptions.length,
    skippedFresh: subscriptions.length - due.length,
    success: series.filter((item) => item.status !== "failed").length,
    failed: series.filter((item) => item.status === "failed").length,
    series,
  };
}

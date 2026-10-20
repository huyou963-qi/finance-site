import type { PrismaClient } from "@prisma/client";
import { parseReleaseRule } from "./releaseRule";
import type { PackageRunState } from "./packageScheduleGuard";
import { loadExcludedCatalogKeys } from "../catalogExclusions";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";

// NBS marks these four ownership UUIDs “(发布库已用)工业增加值”.
// Their historical series must not impose a current-month release obligation.
// Do not infer this exemption merely from a stale observation date.
const HISTORICAL_NBS_OWNERSHIP = /^nbs_cn_industrial_(collective|cooperative)_(yoy|cyoy)$/;

/**
 * 读取每个发布包的「跑没跑过 / 消费没消费」状态，供 `packageScheduleGuard` 判定。
 *
 * 发布包本身不记 lastSuccessAt，只有成员订阅记；包是原子工作单元，所以取成员的
 * 最小值才能代表全包，任一成员成功不能替失败成员消费本期。
 * `sourceSync` 存在成员 releaseRule JSON 里（由
 * `runSubscription` 在确认「本地 obsDate == 源端 obsDate」时写入）。
 */
export async function loadPackageRunStates(
  prisma: PrismaClient,
): Promise<Map<string, PackageRunState>> {
  const excluded = await loadExcludedCatalogKeys(prisma);
  const rows = await prisma.dataSubscription.findMany({
    where: { releasePackageId: { not: null }, enabled: true },
    select: { releasePackageId: true, granularity: true, lastSuccessAt: true, lastObsDate: true, lastError: true, releaseRule: true,
      sourceSeriesKey: true, source: { select: { adapterKind: true } },
      instrument: { select: { code: true, metadata: true } } },
  });

  const map = new Map<string, PackageRunState>();
  for (const row of rows) {
    const packageId = row.releasePackageId;
    if (!packageId) continue;
    if (excluded.has(`mds:${row.instrument.code}`) || excluded.has(`fred:${row.sourceSeriesKey}`)) continue;
    // Use the worker's exact eligibility gate. An archived/unconfirmed member
    // that the worker never selects cannot require a successful run forever.
    // Eligible failed members still participate in the all-member minimum.
    if (!row.lastError && !subscriptionEligibleForSchedule({
      subscriptionEnabled: true,
      adapterKind: row.source.adapterKind,
      sourceSeriesKey: row.sourceSeriesKey,
      metadata: row.instrument.metadata,
    })) continue;
    const verifiedAt = sourceVerifiedAtFromRule(row.releaseRule);
    const previous = map.get(packageId);
    const min = (a: Date | null, b: Date | null) => a && b ? a < b ? a : b : null;
    const state: PackageRunState = previous ? {
      lastSuccessAt: min(previous.lastSuccessAt, row.lastSuccessAt),
      sourceVerifiedAt: min(previous.sourceVerifiedAt, verifiedAt),
      hasUnresolvedFailures: previous.hasUnresolvedFailures || Boolean(row.lastError),
    } : { lastSuccessAt: row.lastSuccessAt, sourceVerifiedAt: verifiedAt, hasUnresolvedFailures: Boolean(row.lastError) };
    if (previous?.requiredMonthlyObservation) state.requiredMonthlyObservation = previous.requiredMonthlyObservation;
    if (previous?.requiredSeriesLatestObsDate !== undefined) state.requiredSeriesLatestObsDate = previous.requiredSeriesLatestObsDate;
    if ((packageId === "us.bls.employment_situation" && row.instrument.code === "sched_fred_PAYEMS") ||
        (packageId === "us.adp.ner" && row.instrument.code === "sched_fred_ADPMNUSNERSA")) {
      state.requiredSeriesLatestObsDate = row.lastObsDate ?? null;
    }
    if (packageId === "us.bls.cpi" || (row.granularity === "MONTHLY" &&
        !HISTORICAL_NBS_OWNERSHIP.test(row.instrument.code) &&
        ["cn.nbs.ppi", "cn.nbs.industrial-production", "cn.nbs.retail-sales"].includes(packageId))) {
      state.requiredMonthlyObservation = {
        oldest: previous?.requiredMonthlyObservation
          ? min(previous.requiredMonthlyObservation.oldest, row.lastObsDate) : row.lastObsDate ?? null,
        lagMonths: 1,
      };
    }
    map.set(packageId, state);
  }
  return map;
}

function sourceVerifiedAtFromRule(raw: unknown): Date | null {
  const rule = parseReleaseRule(raw);
  if (rule.type !== "economic_calendar") return null;
  const sourceSync = rule.sourceSync;
  if (!sourceSync || sourceSync.status !== "current") return null;
  const at = new Date(sourceSync.verifiedAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

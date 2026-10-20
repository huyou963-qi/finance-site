import type { PrismaClient } from "@prisma/client";
import { parseReleaseRule } from "./releaseRule";
import type { PackageRunState } from "./packageScheduleGuard";
import { loadExcludedCatalogKeys } from "../catalogExclusions";
import { subscriptionEligibleForSchedule } from "./subscriptionEligibility";
import { MONTHLY_RELEASE_LAG } from "./releaseObservationPolicy";
import { fredReleaseIdsForPackage } from "./fredReleaseCalendar/catalog";

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
    const requiresPublicationProof = row.source.adapterKind === "FRED_API";
    const verifiedAt = sourceVerifiedAtFromRule(row.releaseRule, requiresPublicationProof);
    const previous = map.get(packageId);
    const min = (a: Date | null, b: Date | null) => a && b ? a < b ? a : b : null;
    const state: PackageRunState = previous ? {
      lastSuccessAt: min(previous.lastSuccessAt, row.lastSuccessAt),
      sourceVerifiedAt: min(previous.sourceVerifiedAt, verifiedAt),
      hasUnresolvedFailures: previous.hasUnresolvedFailures || Boolean(row.lastError),
    } : { lastSuccessAt: row.lastSuccessAt, sourceVerifiedAt: verifiedAt, hasUnresolvedFailures: Boolean(row.lastError) };
    state.requiresPublicationProof = previous?.requiresPublicationProof || requiresPublicationProof;
    if (requiresPublicationProof && (fredReleaseIdsForPackage(packageId)?.length ?? 0) > 1) {
      const rule = parseReleaseRule(row.releaseRule);
      const proof = rule.type === "economic_calendar" ? rule.sourceSync : undefined;
      const requirements = proof?.sourcePublications?.map((item) => ({ releaseId: item.releaseId,
        publishedAt: Date.parse(item.publishedAt) <= Date.parse(proof.verifiedAt) ? new Date(item.publishedAt) : null,
        ...(packageId === "us.fed.fomc" && row.sourceSeriesKey === "FEDFUNDS"
          ? { monthlyLag: 1, observation: row.lastObsDate } : {}),
      })) ?? [{ releaseId: null, publishedAt: null }];
      state.publicationRequirements = [...previous?.publicationRequirements ?? [], ...requirements];
    }
    if (previous?.requiredMonthlyObservation) state.requiredMonthlyObservation = previous.requiredMonthlyObservation;
    if (previous?.requiredSeriesLatestObsDate !== undefined) state.requiredSeriesLatestObsDate = previous.requiredSeriesLatestObsDate;
    if ((packageId === "us.bls.employment_situation" && row.instrument.code === "sched_fred_PAYEMS") ||
        (packageId === "us.adp.ner" && row.instrument.code === "sched_fred_ADPMNUSNERSA")) {
      state.requiredSeriesLatestObsDate = row.lastObsDate ?? null;
    }
    if (MONTHLY_RELEASE_LAG[packageId] != null && row.granularity === "MONTHLY" &&
        !HISTORICAL_NBS_OWNERSHIP.test(row.instrument.code)) {
      state.requiredMonthlyObservation = {
        oldest: previous?.requiredMonthlyObservation
          ? min(previous.requiredMonthlyObservation.oldest, row.lastObsDate) : row.lastObsDate ?? null,
        lagMonths: MONTHLY_RELEASE_LAG[packageId],
      };
    }
    map.set(packageId, state);
  }
  return map;
}

function sourceVerifiedAtFromRule(raw: unknown, requiresPublicationProof: boolean): Date | null {
  const rule = parseReleaseRule(raw);
  if (rule.type !== "economic_calendar") return null;
  const sourceSync = rule.sourceSync;
  if (!sourceSync || sourceSync.status !== "current") return null;
  // Legacy equality proofs cannot certify a FRED publication. Migrates safely
  // by rechecking through the existing worker instead of trusting old timestamps.
  const timestamp = requiresPublicationProof ? sourceSync.sourcePublishedAt : sourceSync.verifiedAt;
  if (!timestamp) return null;
  const at = new Date(timestamp);
  const verifiedAt = new Date(sourceSync.verifiedAt);
  return Number.isNaN(at.getTime()) || Number.isNaN(verifiedAt.getTime()) || at > verifiedAt ? null : at;
}

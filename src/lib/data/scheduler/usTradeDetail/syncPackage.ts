import type { PrismaClient } from "@prisma/client";
import { runDataSubscription, type SubscriptionWithRelations } from "../runSubscription";
import type { SubscriptionRunResult } from "../types";
import { computeBackoffRunAt } from "../releaseRule";
import { recordScheduleChange } from "../schedulerAudit";
import { isHistoricalCensusSeries } from "./lifecycle";
import { subscriptionEligibleForSchedule } from "../subscriptionEligibility";

/** Failure domains are acquisition paths, NOT economic release packages.
 * An API country-row/schema error is member-specific unless the whole HTTP
 * request failed. Do not suppress every partner because one old code is absent. */
export function censusFailureDomain(code: string, hasApiKey: boolean): string {
  const nsa = /^census_us_trade_(exports|imports)_country_nsa_/.exec(code);
  if (nsa && hasApiKey) return "api:" + nsa[1];
  const enduse = /^census_us_trade_(exports|imports)_enduse_/.exec(code);
  if (enduse) return "file:" + enduse[1];
  return /^census_us_trade_(exports|imports)_country_/.test(code)
    ? "country-workbooks" : "member:" + code; // e.g. FRED BOPGSTB in the same release
}

export function sharedCensusFailure(error: string): boolean {
  return /Census live source unavailable|Census partner API (network request failed|HTTP \d+|response is not valid JSON|release table schema changed)/.test(error);
}

/** Per-member schedules commit normally; only package fan-out/calendar refresh
 * is deferred. preserveNextRunAt would preserve a PAST timestamp on failure,
 * producing retries on every five-minute worker invocation. */
export async function syncCensusPackage(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  options: { force?: boolean; runMember?: typeof runDataSubscription;
    hasApiKey?: boolean;
    onMember?: (sub: SubscriptionWithRelations, result: SubscriptionRunResult) => void } = {},
) {
  const packageId = subs[0]?.releasePackageId;
  if (!packageId || subs.some(sub => sub.releasePackageId !== packageId)) throw new Error("Census members must share one package");
  const failures = new Map<string, { code: string; error: string }>();
  const results: { sub: SubscriptionWithRelations; result: SubscriptionRunResult }[] = [];
  const hasKey = options.hasApiKey ?? Boolean(process.env.CENSUS_API_KEY?.trim());
  for (const sub of subs) {
    const domain = censusFailureDomain(sub.instrument.code, hasKey);
    const failure = failures.get(domain);
    let result: SubscriptionRunResult;
    if (failure) {
      const now = new Date(), retryCount = sub.retryCount + 1;
      const nextRunAt = computeBackoffRunAt(retryCount, now);
      const error = `acquisition_aborted_after_request_failure: ${failure.code}`;
      // This is explicitly NOT a checked/no-change observation.
      await prisma.$transaction([
        prisma.fetchRun.create({ data: { subscriptionId: sub.id, startedAt: now, finishedAt: now,
          status: "SKIPPED", error, metadata: { trigger: options.force ? "force" : "scheduled",
            skipReason: "acquisition_aborted_after_request_failure", acquisitionDomain: domain,
            failedMemberCode: failure.code, packageError: failure.error.slice(0, 500), releasePackageId: packageId } } }),
        prisma.dataSubscription.update({ where: { id: sub.id },
          data: { nextRunAt, retryCount, lastError: `${error}; ${failure.error.slice(0, 1500)}` } }),
      ]);
      await recordScheduleChange(prisma, { subscriptionId: sub.id,
        previousNextRunAt: sub.nextRunAt, nextRunAt, source: "data_worker",
        reason: "census_acquisition_failed_backoff", metadata: { acquisitionDomain: domain, failedMemberCode: failure.code } });
      result = { status: "skipped", rowsUpserted: 0, rowsSkipped: 0, error };
    } else {
      result = await (options.runMember ?? runDataSubscription)(prisma, sub, {
        force: options.force, deferPackageSchedule: true,
      });
      if (result.status === "failed" && sharedCensusFailure(result.error ?? "")) {
        failures.set(domain, { code: sub.instrument.code, error: result.error! });
      }
    }
    results.push({ sub, result });
    options.onMember?.(sub, result);
  }
  // Never fan a failure timestamp/error out to unrelated acquisition domains.
  // An interrupted/unselected member retains its due point and remains eligible.
  const schedules = await prisma.dataSubscription.findMany({
    where: { releasePackageId: packageId, enabled: true }, orderBy: { nextRunAt: "asc" },
    select: { nextRunAt: true, sourceSeriesKey: true, source: { select: { adapterKind: true } },
      instrument: { select: { metadata: true } } },
  });
  const pending = schedules.find(sub => !isHistoricalCensusSeries(sub.sourceSeriesKey) &&
    subscriptionEligibleForSchedule({ subscriptionEnabled: true, sourceSeriesKey: sub.sourceSeriesKey,
      adapterKind: sub.source.adapterKind, metadata: sub.instrument.metadata }));
  if (pending?.nextRunAt) {
    const previous = await prisma.releasePackage.findUnique({ where: { id: packageId }, select: { nextRunAt: true } });
    await prisma.releasePackage.update({ where: { id: packageId }, data: { nextRunAt: pending.nextRunAt } });
    await recordScheduleChange(prisma, { releasePackageId: packageId,
      previousNextRunAt: previous?.nextRunAt, nextRunAt: pending.nextRunAt, source: "data_worker",
      reason: "census_acquisition_domains_completed",
      metadata: { members: results.length, failedDomains: [...failures.keys()],
        failed: results.filter(x => x.result.status === "failed").length } });
  }
  return results;
}

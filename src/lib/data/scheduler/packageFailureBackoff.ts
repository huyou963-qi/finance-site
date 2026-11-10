import type { PrismaClient } from "@prisma/client";
import { computeBackoffRunAt } from "./releaseRule";
import { recordScheduleChange } from "./schedulerAudit";
import type { SubscriptionWithRelations } from "./runSubscription";

/** A later member ran with preserveNextRunAt to avoid successful fan-out.
 * That preserved (possibly expired) timestamp is NOT its failure retry.
 * Derive and atomically persist a fresh retry, rather than reading the stale
 * timestamp back and copying it over the whole package every five minutes. */
export async function backoffFailedPackage(
  prisma: PrismaClient, sub: SubscriptionWithRelations, error: string, now = new Date(),
  options: { sourcePending?: boolean } = {},
) {
  if (!sub.releasePackageId) throw new Error("Package backoff requires a package");
  const nextRunAt = computeBackoffRunAt(sub.retryCount + 1, now);
  const previous = await prisma.releasePackage.findUnique({
    where: { id: sub.releasePackageId }, select: { nextRunAt: true },
  });
  // A source-pending member keeps its own lastError, so the package still
  // cannot consume this period. Its healthy siblings did fetch the period;
  // stamping them failed would turn one lagging member into a whole-package alarm.
  const siblings = options.sourcePending
    ? { nextRunAt }
    : { nextRunAt, retryCount: { increment: 1 },
        lastError: `package member ${sub.instrument.code} failed: ${error.slice(0, 1800)}` };
  await prisma.$transaction([
    prisma.dataSubscription.update({ where: { id: sub.id }, data: { nextRunAt } }),
    prisma.releasePackage.update({ where: { id: sub.releasePackageId }, data: { nextRunAt } }),
    prisma.dataSubscription.updateMany({
      where: { releasePackageId: sub.releasePackageId, id: { not: sub.id }, enabled: true },
      data: siblings,
    }),
  ]);
  await recordScheduleChange(prisma, {
    releasePackageId: sub.releasePackageId, previousNextRunAt: previous?.nextRunAt,
    nextRunAt, source: "data_worker",
    reason: options.sourcePending ? "package_member_source_pending_backoff" : "package_member_failed_backoff",
    metadata: { failedMemberCode: sub.instrument.code, error: error.slice(0, 500) },
  });
  return nextRunAt;
}

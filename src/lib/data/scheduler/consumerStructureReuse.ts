type ExistingSubscription = {
  sourceId: string;
  sourceSeriesKey: string;
  releasePackageId: string | null;
  revisionLookback: number;
  nextRunAt: Date | null;
};

/** Repair onboarding gaps while retaining the existing fetch and calendar state. */
export function consumerStructureReusePatch(
  fredId: string,
  sub: ExistingSubscription,
  pkg: { id: string; nextRunAt: Date | null } | null,
  now = new Date(),
) {
  if (sub.sourceId !== "fred" || sub.sourceSeriesKey !== fredId ||
    (sub.releasePackageId && sub.releasePackageId !== "us.bea.personal_income")) {
    throw new Error(`${fredId}: existing owner conflict`);
  }
  return {
    revisionLookback: Math.max(sub.revisionLookback, 2400),
    ...(pkg ? { releasePackageId: pkg.id } : {}),
    ...(!sub.nextRunAt ? { nextRunAt: pkg?.nextRunAt ?? now } : {}),
  };
}

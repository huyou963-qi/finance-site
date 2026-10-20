/** The two employment reports publish a monthly level whose reference month is predictable. */
export function expectedEmploymentObservationMonth(
  packageId: string | null | undefined,
  releaseAt: Date,
): Date | null {
  if (Number.isNaN(releaseAt.getTime())) return null;
  const year = releaseAt.getUTCFullYear();
  const month = releaseAt.getUTCMonth();
  if (packageId === "us.bls.employment_situation") {
    return new Date(Date.UTC(year, month - 1, 1));
  }
  if (packageId === "us.adp.ner") {
    // ADP occasionally publishes on the last day of the reference month.
    return new Date(Date.UTC(year, releaseAt.getUTCDate() <= 7 ? month - 1 : month, 1));
  }
  return null;
}

export function hasEmploymentReleaseObservation(
  packageId: string | null | undefined,
  releaseAt: Date,
  latestObsDate: Date | null,
): boolean {
  const expected = expectedEmploymentObservationMonth(packageId, releaseAt);
  return !expected || (latestObsDate !== null && latestObsDate >= expected);
}

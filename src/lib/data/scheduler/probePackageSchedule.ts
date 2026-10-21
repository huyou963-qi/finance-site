import type { PrismaClient } from "@prisma/client";

/** Display aggregate only: probing members keep their own due times and backoffs. */
export async function refreshProbePackageNextRunAt(prisma: PrismaClient, packageId: string) {
  const earliest = await prisma.dataSubscription.findFirst({
    where: { releasePackageId: packageId, enabled: true },
    orderBy: { nextRunAt: { sort: "asc", nulls: "first" } },
    select: { nextRunAt: true },
  });
  await prisma.releasePackage.update({
    where: { id: packageId }, data: { nextRunAt: earliest?.nextRunAt ?? null },
  });
}

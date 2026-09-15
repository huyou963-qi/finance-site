/**
 * Physically remove the 79 Japan detail series retired by the 2026-09-14
 * optimized core-scope review.
 *
 * Default is dry-run. `--apply` deletes instruments and all cascading
 * observations/vintages/subscriptions/package memberships, removes their keys
 * from the persisted catalog layout, writes catalog tombstones, and deletes the
 * now-retired Tokyo CPI release package.
 *
 * npm run data:drop-japan-details
 * npm run data:drop-japan-details -- --apply
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient, type Prisma } from "@prisma/client";
import { JAPAN_RETIRED_DETAIL_CODES } from "../../src/lib/data/scheduler/japanCoreScope";

const prisma = new PrismaClient();
export function disconnectJapanCoreScopeDatabase() {
  return prisma.$disconnect();
}
const EXPECTED_RETIREMENT_COUNT = 79;
const RETIRED_PACKAGE_IDS = ["jp.sbj.tokyo_cpi"];
const retiredCatalogKeys = new Set(
  JAPAN_RETIRED_DETAIL_CODES.map((code) => `mds:${code}`),
);

type LayoutDocument = {
  version?: unknown;
  countries?: Array<{
    categories?: Array<{
      itemKeys?: string[];
      subgroups?: Array<{ itemKeys?: string[] }>;
    }>;
  }>;
};

function removeRetiredLayoutKeys(value: Prisma.JsonValue): {
  layout: Prisma.InputJsonValue;
  removed: number;
} {
  const layout = structuredClone(value) as LayoutDocument;
  let removed = 0;
  for (const country of layout.countries ?? []) {
    for (const category of country.categories ?? []) {
      if (Array.isArray(category.itemKeys)) {
        const before = category.itemKeys.length;
        category.itemKeys = category.itemKeys.filter((key) => !retiredCatalogKeys.has(key));
        removed += before - category.itemKeys.length;
      }
      for (const subgroup of category.subgroups ?? []) {
        if (!Array.isArray(subgroup.itemKeys)) continue;
        const before = subgroup.itemKeys.length;
        subgroup.itemKeys = subgroup.itemKeys.filter((key) => !retiredCatalogKeys.has(key));
        removed += before - subgroup.itemKeys.length;
      }
    }
  }
  return { layout: layout as Prisma.InputJsonValue, removed };
}

export async function runDropJapanDetails(apply = process.argv.includes("--apply")) {
  const uniqueCodes = new Set<string>(JAPAN_RETIRED_DETAIL_CODES);
  if (
    JAPAN_RETIRED_DETAIL_CODES.length !== EXPECTED_RETIREMENT_COUNT ||
    uniqueCodes.size !== EXPECTED_RETIREMENT_COUNT
  ) {
    throw new Error(
      `retirement list must contain exactly ${EXPECTED_RETIREMENT_COUNT} unique codes; ` +
        `received ${JAPAN_RETIRED_DETAIL_CODES.length}/${uniqueCodes.size}`,
    );
  }

  const targets = await prisma.instrument.findMany({
    where: { code: { in: [...JAPAN_RETIRED_DETAIL_CODES] } },
    select: { id: true, code: true, name: true, shortName: true },
    orderBy: { code: "asc" },
  });
  const ids = targets.map((target) => target.id);
  const foundCodes = new Set(targets.map((target) => target.code));
  const missingCodes = JAPAN_RETIRED_DETAIL_CODES.filter((code) => !foundCodes.has(code));
  const layouts = await prisma.macroCatalogLayout.findMany({
    select: { id: true, layout: true },
  });
  const layoutUpdates = layouts.map((row) => ({
    id: row.id,
    ...removeRetiredLayoutKeys(row.layout),
  }));

  const [observations, vintages, subscriptions, packageMembers, bars, tombstones] =
    await Promise.all([
      prisma.macroObservation.count({ where: { instrumentId: { in: ids } } }),
      prisma.macroObservationVintage.count({ where: { instrumentId: { in: ids } } }),
      prisma.dataSubscription.count({ where: { instrumentId: { in: ids } } }),
      prisma.releasePackageMember.count({ where: { instrumentId: { in: ids } } }),
      prisma.bar.count({ where: { instrumentId: { in: ids } } }),
      prisma.macroCatalogExcludedKey.count({
        where: { catalogKey: { in: [...retiredCatalogKeys] } },
      }),
    ]);

  console.log(
    `[drop-japan-details] target-list=${EXPECTED_RETIREMENT_COUNT} found=${targets.length} ` +
      `missing=${missingCodes.length}`,
  );
  console.log(
    `[drop-japan-details] observations=${observations} vintages=${vintages} ` +
      `subscriptions=${subscriptions} packageMembers=${packageMembers} bars=${bars}`,
  );
  console.log(
    `[drop-japan-details] catalogLayoutKeys=${layoutUpdates.reduce((n, row) => n + row.removed, 0)} ` +
      `existingTombstones=${tombstones}`,
  );
  for (const target of targets.slice(0, 8)) {
    console.log(`  ${target.code}  ${target.shortName ?? target.name}`);
  }
  if (targets.length > 8) console.log(`  ... ${targets.length - 8} more`);
  if (missingCodes.length > 0 && missingCodes.length < EXPECTED_RETIREMENT_COUNT) {
    console.log(`  already absent: ${missingCodes.join(", ")}`);
  }

  if (!apply) {
    console.log("[drop-japan-details] dry-run only; add --apply to execute the approved deletion");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of layoutUpdates) {
      if (row.removed === 0) continue;
      await tx.macroCatalogLayout.update({
        where: { id: row.id },
        data: { layout: row.layout, updatedBy: "drop-japan-details" },
      });
    }
    for (const catalogKey of retiredCatalogKeys) {
      await tx.macroCatalogExcludedKey.upsert({
        where: { catalogKey },
        create: { catalogKey, deletedBy: "drop-japan-details" },
        update: { deletedBy: "drop-japan-details" },
      });
    }
    if (ids.length > 0) {
      await tx.instrument.deleteMany({ where: { id: { in: ids } } });
    }
    await tx.releasePackage.deleteMany({ where: { id: { in: RETIRED_PACKAGE_IDS } } });
  });

  const [remainingInstruments, remainingSubscriptions, finalTombstones, retiredPackages] =
    await Promise.all([
      prisma.instrument.count({ where: { code: { in: [...JAPAN_RETIRED_DETAIL_CODES] } } }),
      prisma.dataSubscription.count({
        where: { instrument: { code: { in: [...JAPAN_RETIRED_DETAIL_CODES] } } },
      }),
      prisma.macroCatalogExcludedKey.count({
        where: { catalogKey: { in: [...retiredCatalogKeys] } },
      }),
      prisma.releasePackage.count({ where: { id: { in: RETIRED_PACKAGE_IDS } } }),
    ]);
  if (
    remainingInstruments !== 0 ||
    remainingSubscriptions !== 0 ||
    finalTombstones !== EXPECTED_RETIREMENT_COUNT ||
    retiredPackages !== 0
  ) {
    throw new Error(
      `post-delete verification failed: instruments=${remainingInstruments}, ` +
        `subscriptions=${remainingSubscriptions}, tombstones=${finalTombstones}, ` +
        `retiredPackages=${retiredPackages}`,
    );
  }
  console.log(
    `[drop-japan-details] deleted instruments=${targets.length}; cascading observations=${observations}, ` +
      `vintages=${vintages}, subscriptions=${subscriptions}, packageMembers=${packageMembers}`,
  );
  console.log(
    `[drop-japan-details] verified: 0 retired instruments/subscriptions/packages, ` +
      `${EXPECTED_RETIREMENT_COUNT} catalog tombstones`,
  );
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/drop-japan-details.ts")) {
  runDropJapanDetails()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => disconnectJapanCoreScopeDatabase());
}

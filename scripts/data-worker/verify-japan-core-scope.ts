import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { JAPAN_RETIRED_DETAIL_CODES } from "../../src/lib/data/scheduler/japanCoreScope";

const prisma = new PrismaClient();

async function main() {
  assert.equal(JAPAN_RETIRED_DETAIL_CODES.length, 79);
  assert.equal(new Set(JAPAN_RETIRED_DETAIL_CODES).size, 79);
  const catalogKeys = JAPAN_RETIRED_DETAIL_CODES.map((code) => `mds:${code}`);
  const [instruments, subscriptions, tombstones, tokyoPackage] = await Promise.all([
    prisma.instrument.count({ where: { code: { in: [...JAPAN_RETIRED_DETAIL_CODES] } } }),
    prisma.dataSubscription.count({
      where: { instrument: { code: { in: [...JAPAN_RETIRED_DETAIL_CODES] } } },
    }),
    prisma.macroCatalogExcludedKey.count({ where: { catalogKey: { in: catalogKeys } } }),
    prisma.releasePackage.count({ where: { id: "jp.sbj.tokyo_cpi" } }),
  ]);
  assert.equal(instruments, 0, "retired Japan instruments must remain physically absent");
  assert.equal(subscriptions, 0, "retired Japan subscriptions must remain absent");
  assert.equal(tombstones, 79, "all retired Japan catalog keys need tombstones");
  assert.equal(tokyoPackage, 0, "retired Tokyo CPI release package must remain absent");
  console.log("[verify-japan-core-scope] 79 retired series absent; subscriptions/packages absent; tombstones complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

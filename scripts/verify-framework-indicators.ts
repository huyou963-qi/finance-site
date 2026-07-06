/**
 * 诊断宏观框架页指标库映射与观测回填。
 * npm run data:verify-framework-indicators
 */
import { loadEnvConfig } from "@next/env";
import { InstrumentKind } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  FRAMEWORK_INDICATOR_CATALOG_KEYS,
  FRAMEWORK_SPARKLINE_POINTS,
} from "../src/lib/macro-framework/indicatorCatalogKeys";
import { fetchFrameworkIndicatorsFromDb } from "../src/lib/macro-framework/fetchIndicatorsFromDb";

loadEnvConfig(process.cwd());

async function main() {
  const ids = Object.keys(FRAMEWORK_INDICATOR_CATALOG_KEYS);
  console.log(`[verify-framework] catalog keys: ${ids.length}`);

  const fredIds = new Set<string>();
  const mdsCodes = new Set<string>();
  for (const key of Object.values(FRAMEWORK_INDICATOR_CATALOG_KEYS)) {
    if (key.startsWith("fred:")) fredIds.add(key.slice(5).toUpperCase());
    if (key.startsWith("mds:")) mdsCodes.add(key.slice(4));
  }

  const [fredInsts, mdsInsts, fredObsCount, mdsObsCount] = await Promise.all([
    prisma.instrument.findMany({
      where: { kind: InstrumentKind.MACRO_SERIES, fredSeriesId: { in: [...fredIds] } },
      select: { fredSeriesId: true },
    }),
    prisma.instrument.findMany({
      where: { kind: InstrumentKind.MACRO_SERIES, code: { in: [...mdsCodes] } },
      select: { code: true },
    }),
    prisma.macroObservation.count({
      where: {
        instrument: {
          kind: InstrumentKind.MACRO_SERIES,
          fredSeriesId: { in: [...fredIds] },
        },
      },
    }),
    prisma.macroObservation.count({
      where: {
        instrument: {
          kind: InstrumentKind.MACRO_SERIES,
          code: { in: [...mdsCodes] },
        },
      },
    }),
  ]);

  console.log(`[verify-framework] fred instruments: ${fredInsts.length}/${fredIds.size}`);
  console.log(`[verify-framework] mds instruments: ${mdsInsts.length}/${mdsCodes.size}`);
  console.log(`[verify-framework] fred observations: ${fredObsCount}`);
  console.log(`[verify-framework] mds observations: ${mdsObsCount}`);

  const payload = await fetchFrameworkIndicatorsFromDb();
  const withValue = Object.values(payload.indicators).filter((s) => s.value !== null);
  const withSpark = Object.values(payload.indicators).filter((s) => s.sparkline.length > 0);
  console.log(
    `[verify-framework] fetch result: value=${withValue.length}/${ids.length} sparkline=${withSpark.length}/${ids.length}`,
  );

  const missing = ids.filter((id) => payload.indicators[id]?.value === null);
  if (missing.length > 0) {
    console.log("[verify-framework] missing value (first 15):");
    for (const id of missing.slice(0, 15)) {
      console.log(`  - ${id} → ${FRAMEWORK_INDICATOR_CATALOG_KEYS[id]}`);
    }
  }

  console.log(`[verify-framework] sparkline points per series: ${FRAMEWORK_SPARKLINE_POINTS}`);
}

main()
  .catch((e) => {
    console.error("[verify-framework] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

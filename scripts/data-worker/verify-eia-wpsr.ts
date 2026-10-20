/**
 * EIA WPSR onboarding checks.
 *
 * npm run data:verify-eia-wpsr -- --fixture-dir=.data/eia-wpsr
 * npm run data:verify-eia-wpsr -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { fetchEiaWpsrWorkbook } from "../../src/lib/data/scheduler/eiaWpsr/client";
import {
  EIA_WPSR_PACKAGE_ID,
  EIA_WPSR_PROVIDER,
  EIA_WPSR_SERIES,
  EIA_WPSR_SOURCE,
} from "../../src/lib/data/scheduler/eiaWpsr/catalog";
import { parseEiaWpsrWorkbook } from "../../src/lib/data/scheduler/eiaWpsr/parseWorkbook";

function argValue(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  let errors = 0;
  const fixtureDir = argValue("fixture-dir");
  const codes = new Set<string>();
  const sourceKeys = new Set<string>();
  for (const row of EIA_WPSR_SERIES) {
    if (codes.has(row.code) || sourceKeys.has(row.sourceSeriesKey)) {
      console.error(`  ✗ 重复 code/source key：${row.code}/${row.sourceSeriesKey}`);
      errors++;
    }
    codes.add(row.code);
    sourceKeys.add(row.sourceSeriesKey);
    if (row.category !== "通胀与价格" || row.subgroup !== "通胀预期与能源") {
      console.error(`  ✗ ${row.code} 目录落点异常`);
      errors++;
    }
    if (fixtureDir) {
      try {
        const workbook = await fetchEiaWpsrWorkbook(row.sourceSeriesKey, {
          fixturePath: path.join(fixtureDir, `${row.sourceSeriesKey}w.xls`),
        });
        const parsed = parseEiaWpsrWorkbook(workbook, row);
        if (parsed.points.length < row.minimumHistoryPoints) {
          throw new Error(`仅 ${parsed.points.length} 点，应 ≥${row.minimumHistoryPoints}`);
        }
        console.log(
          `  ✓ fixture ${row.sourceSeriesKey}: ${parsed.points.length} 点，` +
            `${parsed.points[0]!.obsDate.toISOString().slice(0, 10)} → ${parsed.latestObsDate.toISOString().slice(0, 10)}`,
        );
      } catch (error) {
        console.error(`  ✗ fixture ${row.sourceSeriesKey}: ${error instanceof Error ? error.message : error}`);
        errors++;
      }
    }
  }

  if (process.argv.includes("--db")) {
    const prisma = new PrismaClient();
    try {
      for (const row of EIA_WPSR_SERIES) {
        const instrument = await prisma.instrument.findUnique({
          where: { code: row.code },
          include: { dataSubscription: true },
        });
        if (!instrument) {
          console.error(`  ✗ 缺 Instrument ${row.code}`);
          errors++;
          continue;
        }
        const metadata = (instrument.metadata ?? {}) as Record<string, unknown>;
        const scrape = metadata.scrape as Record<string, unknown> | undefined;
        const acquisition = readFetchAcquisition(instrument.metadata);
        const subscription = instrument.dataSubscription;
        if (
          metadata.catalogKey !== `mds:${row.code}` ||
          metadata.catalogCategory !== row.category ||
          metadata.catalogSubcategory !== row.subgroup ||
          scrape?.provider !== EIA_WPSR_PROVIDER ||
          scrape?.seriesId !== row.sourceSeriesKey ||
          acquisition?.status !== "known" ||
          subscription?.sourceId !== EIA_WPSR_SOURCE.id ||
          subscription?.sourceSeriesKey !== row.sourceSeriesKey ||
          !subscription.enabled
        ) {
          console.error(`  ✗ ${row.code} metadata/subscription 不完整`);
          errors++;
        }
        if (subscription?.releasePackageId !== EIA_WPSR_PACKAGE_ID) {
          console.error(
            `  ✗ ${row.code} 未归入 ${EIA_WPSR_PACKAGE_ID}（先整合 releasePackageCatalog 并 seed-release-packages）`,
          );
          errors++;
        }
        const count = await prisma.macroObservation.count({ where: { instrumentId: instrument.id } });
        const latest = await prisma.macroObservation.findFirst({
          where: { instrumentId: instrument.id },
          orderBy: { obsDate: "desc" },
        });
        if (count < row.minimumHistoryPoints || !latest) {
          console.error(`  ✗ ${row.code} 观测仅 ${count}`);
          errors++;
        } else {
          console.log(`  ✓ DB ${row.code}: ${count} 点，最新 ${latest.obsDate.toISOString().slice(0, 10)}`);
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  if (errors > 0) {
    console.error(`[verify-eia-wpsr] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log(`[verify-eia-wpsr] 通过：${EIA_WPSR_SERIES.length} 条标准基础序列`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

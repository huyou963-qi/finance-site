/** 美联储常备回购便利（SRF）操作利率、使用量及抵押品分项接入自检。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { STANDING_REPO_FRED_SERIES } from "../../src/lib/data/scheduler/standingRepoFredSeedCatalog";

loadEnvConfig(process.cwd());

const EXPECTED_START_MAX: Record<string, string> = {
  RPONTTLD: "2000-01-03",
  RPONTSYD: "2000-01-03",
  RPONAGYD: "2000-01-03",
  RPONMBSD: "2000-01-03",
  RPONTSYSAD: "2000-07-07",
  SRFTSYD: "2021-07-29",
};

function daysAgo(days: number): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

async function main() {
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-standing-repo] ${STANDING_REPO_FRED_SERIES.length} 条；日频；Temporary Open Market Operations`,
  );
  if (!useDb) {
    console.log("[verify-standing-repo] 静态目录通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const item of STANDING_REPO_FRED_SERIES) {
      const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
      if (!instrument) {
        console.error(`  ✗ 缺 Instrument ${item.code}`);
        errors += 1;
        continue;
      }
      if (
        instrument.fredSeriesId !== item.fredId ||
        instrument.freqLabel !== item.freqLabel ||
        instrument.unit !== item.unit
      ) {
        console.error(
          `  ✗ ${item.fredId} 属性不符 fred=${instrument.fredSeriesId} freq=${instrument.freqLabel} unit=${instrument.unit}`,
        );
        errors += 1;
      }

      const metadata =
        instrument.metadata &&
        typeof instrument.metadata === "object" &&
        !Array.isArray(instrument.metadata)
          ? (instrument.metadata as Record<string, unknown>)
          : {};
      const acquisition =
        metadata.fetchAcquisition &&
        typeof metadata.fetchAcquisition === "object" &&
        !Array.isArray(metadata.fetchAcquisition)
          ? (metadata.fetchAcquisition as Record<string, unknown>)
          : {};
      if (
        metadata.countryCode !== "US" ||
        metadata.catalogKey !== `fred:${item.fredId}` ||
        !metadata.catalogCategory ||
        acquisition.status !== "known"
      ) {
        console.error(
          `  ✗ ${item.fredId} metadata/fetchAcquisition 不完整 category=${String(metadata.catalogCategory)} acquisition=${String(acquisition.status)}`,
        );
        errors += 1;
      }

      const subscription = await prisma.dataSubscription.findUnique({
        where: { instrumentId: instrument.id },
      });
      const rule = subscription?.releaseRule as { type?: string; intervalHours?: number } | undefined;
      if (
        !subscription?.enabled ||
        subscription.sourceId !== "fred" ||
        subscription.sourceSeriesKey !== item.fredId ||
        subscription.releasePackageId !== item.releasePackageId ||
        rule?.type !== "probe_interval" ||
        rule.intervalHours !== 24
      ) {
        console.error(
          `  ✗ ${item.fredId} 订阅不符 source=${subscription?.sourceId} package=${subscription?.releasePackageId} rule=${JSON.stringify(rule)}`,
        );
        errors += 1;
      }

      const aggregate = await prisma.macroObservation.aggregate({
        where: { instrumentId: instrument.id },
        _count: true,
        _min: { obsDate: true },
        _max: { obsDate: true },
      });
      const first = aggregate._min.obsDate?.toISOString().slice(0, 10) ?? null;
      const latest = aggregate._max.obsDate?.toISOString().slice(0, 10) ?? null;
      const minCount = item.fredId === "SRFTSYD" ? 1_000 : 3_000;
      const currentUsageSeries = item.fredId !== "SRFTSYD";
      if (
        !first ||
        first > EXPECTED_START_MAX[item.fredId]! ||
        aggregate._count < minCount ||
        !latest ||
        (currentUsageSeries && aggregate._max.obsDate! < daysAgo(14))
      ) {
        console.error(
          `  ✗ ${item.fredId} 历史/时效不完整 count=${aggregate._count} first=${first} latest=${latest}`,
        );
        errors += 1;
      } else {
        console.log(
          `  ✓ ${item.fredId} count=${aggregate._count} first=${first} latest=${latest} package=${item.releasePackageId}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-standing-repo] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

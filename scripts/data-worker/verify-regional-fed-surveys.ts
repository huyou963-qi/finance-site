/** 地区联储制造业景气调查（Empire State / Philadelphia Fed / Dallas Fed）接入自检。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { REGIONAL_FED_SURVEY_FRED_SERIES } from "../../src/lib/data/scheduler/regionalFedSurveysFredSeedCatalog";

loadEnvConfig(process.cwd());

const EXPECTED_START_MAX: Record<string, string> = {
  GACDISA066MSFRBNY: "2001-07-01",
  GACDFSA066MSFRBPHI: "1968-05-01",
  BACTSAMFRBDAL: "2004-06-01",
};

const MIN_COUNT: Record<string, number> = {
  GACDISA066MSFRBNY: 290,
  GACDFSA066MSFRBPHI: 690,
  BACTSAMFRBDAL: 260,
};

function daysAgo(days: number): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

async function main() {
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-regional-fed-surveys] ${REGIONAL_FED_SURVEY_FRED_SERIES.length} 条；月频；地区联储制造业景气调查`,
  );
  if (!useDb) {
    console.log("[verify-regional-fed-surveys] 静态目录通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const item of REGIONAL_FED_SURVEY_FRED_SERIES) {
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
        rule.intervalHours !== 72
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
      if (
        !first ||
        first > EXPECTED_START_MAX[item.fredId]! ||
        aggregate._count < MIN_COUNT[item.fredId]! ||
        !latest ||
        aggregate._max.obsDate! < daysAgo(75)
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
  console.log("[verify-regional-fed-surveys] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

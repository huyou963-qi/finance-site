/** 美联储常备回购便利（SRF）操作利率接入自检。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { STANDING_REPO_FRED_SERIES } from "../../src/lib/data/scheduler/standingRepoFredSeedCatalog";

loadEnvConfig(process.cwd());

async function main() {
  const useDb = process.argv.includes("--db");
  const item = STANDING_REPO_FRED_SERIES[0]!;
  console.log(`[verify-standing-repo] ${item.fredId} 日频/%/Temporary Open Market Operations`);
  if (!useDb) {
    console.log("[verify-standing-repo] 静态目录通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
    if (!instrument) throw new Error(`缺 Instrument ${item.code}`);
    if (
      instrument.fredSeriesId !== item.fredId ||
      instrument.freqLabel !== item.freqLabel ||
      instrument.unit !== item.unit
    ) {
      console.error(
        `  ✗ 属性不符 fred=${instrument.fredSeriesId} freq=${instrument.freqLabel} unit=${instrument.unit}`,
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
        `  ✗ metadata/fetchAcquisition 不完整 category=${String(metadata.catalogCategory)} acquisition=${String(acquisition.status)}`,
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
        `  ✗ 订阅不符 source=${subscription?.sourceId} package=${subscription?.releasePackageId} rule=${JSON.stringify(rule)}`,
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
    // FRED 系列始于 2021-07-29；日值约 1,200+，但政策利率可能在政策调整后停止重复发布。
    if (!first || first > "2021-07-29" || aggregate._count < 1_000 || !latest) {
      console.error(
        `  ✗ 历史不完整 count=${aggregate._count} first=${first} latest=${latest}`,
      );
      errors += 1;
    } else {
      console.log(
        `  ✓ ${item.fredId} count=${aggregate._count} first=${first} latest=${latest} package=${item.releasePackageId}`,
      );
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

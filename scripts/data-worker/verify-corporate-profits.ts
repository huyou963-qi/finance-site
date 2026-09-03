/** BEA NIPA 企业利润（税前/税后）接入自检。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CORPORATE_PROFITS_FRED_SERIES } from "../../src/lib/data/scheduler/corporateProfitsFredSeedCatalog";

loadEnvConfig(process.cwd());

/**
 * FRED 序列本身可回溯至 1947，但本项目 upsertObservations.observationStartDate()
 * 对冷启动统一用 "1950-01-01" 兜底（见该文件注释），故实际入库首日是 1950 而非
 * 1947。这是全局既有约定（其他早于 1950 的 FRED 序列首次接入同样受限），不是本次
 * 接入的缺陷，此处按实际可达到的入库结果校验。
 */
const EXPECTED_START_MAX: Record<string, string> = {
  CP: "1950-01-01",
  A053RC1Q027SBEA: "1950-01-01",
};

const MIN_COUNT = 300;

function daysAgo(days: number): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

async function main() {
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-corporate-profits] ${CORPORATE_PROFITS_FRED_SERIES.length} 条；季频；BEA NIPA 企业利润`,
  );
  if (!useDb) {
    console.log("[verify-corporate-profits] 静态目录通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    for (const item of CORPORATE_PROFITS_FRED_SERIES) {
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
        rule.intervalHours !== 168
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
      // 企业利润随 GDP 第二/三次估计发布，obsDate（季度起始日）到实际可得日的
      // 滞后天然可达 ~5 个月，且下一季度数据要再等一个季度才顶替——按 270 天
      // 宽限（对齐 verify-cycle-risk 对季频 BEA 数据不做严格 daysAgo 卡点的做法，
      // 这里仅做粗粒度断更检测，不卡精确时效）。
      if (
        !first ||
        first > EXPECTED_START_MAX[item.fredId]! ||
        aggregate._count < MIN_COUNT ||
        !latest ||
        aggregate._max.obsDate! < daysAgo(270)
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
  console.log("[verify-corporate-profits] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

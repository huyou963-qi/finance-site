/**
 * 周度市场定价与真实经济确认层数据自检
 *
 * npm run data:verify-market-pricing -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import {
  MARKET_PRICING_FRED_SERIES,
  MARKET_PRICING_REPAIR_SERIES,
} from "../../src/lib/data/scheduler/marketPricingFredSeedCatalog";

loadEnvConfig(process.cwd());

const HISTORY_RULES: Record<string, { maxFirstYear: number; minCount: number }> = {
  T5YIFR: { maxFirstYear: 2004, minCount: 5_000 },
  VXVCLS: { maxFirstYear: 2008, minCount: 4_000 },
  ANFCI: { maxFirstYear: 1972, minCount: 2_800 },
  WEI: { maxFirstYear: 2009, minCount: 900 },
};

function cutoffIso(granularity: DataGranularity, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - (granularity === "DAILY" ? 7 : 21));
  return date.toISOString().slice(0, 10);
}

async function main() {
  const useDb = process.argv.includes("--db");
  let errors = 0;

  console.log(
    `[verify-market-pricing] 新增 ${MARKET_PRICING_FRED_SERIES.length} 条 + 修复 ${MARKET_PRICING_REPAIR_SERIES.length} 条`,
  );
  if (!useDb) {
    console.log("[verify-market-pricing] 静态目录通过（加 --db 检查入库、历史与新鲜度）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log("[verify-market-pricing] 新增序列属性、订阅、发布包、观测与获取状态");
    for (const item of MARKET_PRICING_FRED_SERIES) {
      const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
      if (!instrument) {
        console.error(`  ✗ 缺 Instrument ${item.code}`);
        errors += 1;
        continue;
      }
      if (instrument.fredSeriesId !== item.fredId) {
        console.error(`  ✗ ${item.code} fredSeriesId=${instrument.fredSeriesId ?? "空"}`);
        errors += 1;
      }
      if (instrument.freqLabel !== item.freqLabel || instrument.unit !== item.unit) {
        console.error(
          `  ✗ ${item.code} 属性应为 ${item.freqLabel}/${item.unit}，实际 ${instrument.freqLabel}/${instrument.unit}`,
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
      const missingMetadata = ["countryCode", "displayName", "catalogCategory", "catalogKey"].filter(
        (key) => !metadata[key],
      );
      if (missingMetadata.length > 0) {
        console.error(`  ✗ ${item.code} metadata 缺 ${missingMetadata.join(", ")}`);
        errors += 1;
      }
      if (acquisition.status !== "known") {
        console.error(`  ✗ ${item.code} fetchAcquisition.status=${String(acquisition.status ?? "空")}`);
        errors += 1;
      }

      const subscription = await prisma.dataSubscription.findUnique({
        where: { instrumentId: instrument.id },
      });
      const rule = subscription?.releaseRule as { type?: string } | undefined;
      if (!subscription?.enabled || subscription.sourceId !== "fred" || rule?.type !== "probe_interval") {
        console.error(`  ✗ ${item.code} 订阅未启用或未使用 FRED probe_interval`);
        errors += 1;
      }
      if (subscription?.releasePackageId !== item.releasePackageId) {
        console.error(
          `  ✗ ${item.code} 发布包应为 ${item.releasePackageId}，实际 ${subscription?.releasePackageId ?? "无"}`,
        );
        errors += 1;
      }

      const aggregate = await prisma.macroObservation.aggregate({
        where: { instrumentId: instrument.id },
        _count: true,
        _min: { obsDate: true },
        _max: { obsDate: true },
      });
      const ruleForHistory = HISTORY_RULES[item.fredId]!;
      const first = aggregate._min.obsDate?.toISOString().slice(0, 10) ?? null;
      const latest = aggregate._max.obsDate?.toISOString().slice(0, 10) ?? null;
      if (
        !first ||
        !latest ||
        aggregate._count < ruleForHistory.minCount ||
        Number(first.slice(0, 4)) > ruleForHistory.maxFirstYear ||
        latest < cutoffIso(item.granularity)
      ) {
        console.error(
          `  ✗ ${item.fredId} 历史/新鲜度不合格 count=${aggregate._count} first=${first} latest=${latest}`,
        );
        errors += 1;
      } else {
        console.log(
          `  ✓ ${item.fredId} count=${aggregate._count} first=${first} latest=${latest} package=${item.releasePackageId}`,
        );
      }
    }

    console.log("[verify-market-pricing] 既有序列订阅修复与新鲜度");
    for (const item of MARKET_PRICING_REPAIR_SERIES) {
      const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
      if (!instrument) {
        console.error(`  ✗ 缺复用 Instrument ${item.code}`);
        errors += 1;
        continue;
      }
      const subscription = await prisma.dataSubscription.findUnique({
        where: { instrumentId: instrument.id },
      });
      const expectedType = item.releaseRule().type;
      const actualType = (subscription?.releaseRule as { type?: string } | undefined)?.type;
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: instrument.id },
        orderBy: { obsDate: "desc" },
        select: { obsDate: true },
      });
      const latestIso = latest?.obsDate.toISOString().slice(0, 10) ?? null;
      if (
        !subscription?.enabled ||
        actualType !== expectedType ||
        subscription.releasePackageId !== item.releasePackageId ||
        !latestIso ||
        latestIso < cutoffIso(item.granularity)
      ) {
        console.error(
          `  ✗ ${item.fredId} type=${actualType ?? "空"} package=${subscription?.releasePackageId ?? "无"} latest=${latestIso}`,
        );
        errors += 1;
      } else {
        console.log(
          `  ✓ ${item.fredId} type=${actualType} package=${item.releasePackageId} latest=${latestIso}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-market-pricing] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-market-pricing] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

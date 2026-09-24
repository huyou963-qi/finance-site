/**
 * EIA 能源价格（周度零售汽油、亨利港天然气、航油、取暖油）接入自检。
 *
 * npm run data:verify-eia-energy-prices
 * npm run data:verify-eia-energy-prices -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  EIA_ENERGY_PRICES_FRED_SERIES,
  releaseRuleForEiaEnergyPrices,
} from "../../src/lib/data/scheduler/eiaEnergyPricesFredSeedCatalog";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";

loadEnvConfig(process.cwd());

/** FRED 页面核实的起始日（允许晚几天：首个观测日不一定是月初） */
const EXPECTED_START_MAX: Record<string, string> = {
  GASREGW: "1990-09-01",
  DHHNGSP: "1997-02-01",
  DJFUELUSGULF: "1990-05-01",
  DHOILNYH: "1986-07-01",
};

/**
 * 最少观测数，按 2026-09 源端实测有效点数留约 3% 余量。
 * ⚠ EIA 现货早年本身稀疏（非我们漏抓）：亨利港 1998–2006 每年仅 58–99 个报价日，
 * 取暖油 1993–2006 每年 95–219 个；2007/2008 起才接近全部交易日。
 */
const MIN_COUNT: Record<string, number> = {
  GASREGW: 1800, // 实测 1878
  DHHNGSP: 5500, // 实测 5692
  DJFUELUSGULF: 7800, // 实测 8041
  DHOILNYH: 8500, // 实测 8790
};

/** 最新观测允许滞后天数：EIA 现货在 FRED 上每周三批量更新，再留节假日余量 */
const MAX_LAG_DAYS = 14;

function daysAgo(days: number): Date {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

async function main() {
  const useDb = process.argv.includes("--db");
  let errors = 0;
  console.log(`[verify-eia-energy-prices] ${EIA_ENERGY_PRICES_FRED_SERIES.length} 条；EIA 经 FRED`);

  for (const item of EIA_ENERGY_PRICES_FRED_SERIES) {
    const placement = resolveUsCatalogPlacement({ key: `fred:${item.fredId}` });
    if (placement.category !== "通胀与价格" || placement.subgroup !== "通胀预期与能源") {
      console.error(`  ✗ ${item.fredId} 目录落点 ${placement.category}/${placement.subgroup}（应 通胀与价格/通胀预期与能源）`);
      errors += 1;
    }
  }
  if (!useDb) {
    if (errors > 0) process.exit(1);
    console.log("[verify-eia-energy-prices] 静态目录通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const item of EIA_ENERGY_PRICES_FRED_SERIES) {
      const instrument = await prisma.instrument.findUnique({ where: { code: item.code } });
      if (!instrument) {
        console.error(`  ✗ 缺 Instrument ${item.code}（先 data:seed-eia-energy-prices）`);
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
        instrument.metadata && typeof instrument.metadata === "object" && !Array.isArray(instrument.metadata)
          ? (instrument.metadata as Record<string, unknown>)
          : {};
      const acquisition =
        metadata.fetchAcquisition && typeof metadata.fetchAcquisition === "object"
          ? (metadata.fetchAcquisition as Record<string, unknown>)
          : {};
      if (
        metadata.countryCode !== "US" ||
        metadata.catalogKey !== `fred:${item.fredId}` ||
        metadata.catalogCategory !== "通胀与价格" ||
        acquisition.status !== "known"
      ) {
        console.error(
          `  ✗ ${item.fredId} metadata 不完整 category=${String(metadata.catalogCategory)} acquisition=${String(acquisition.status)}`,
        );
        errors += 1;
      }

      const subscription = await prisma.dataSubscription.findUnique({ where: { instrumentId: instrument.id } });
      const rule = subscription?.releaseRule as { type?: string; intervalHours?: number } | undefined;
      const expected = releaseRuleForEiaEnergyPrices(item.granularity) as { type: string; intervalHours?: number };
      if (
        !subscription?.enabled ||
        subscription.sourceId !== "fred" ||
        subscription.sourceSeriesKey !== item.fredId ||
        subscription.releasePackageId !== item.releasePackageId ||
        rule?.type !== expected.type ||
        rule.intervalHours !== expected.intervalHours
      ) {
        console.error(
          `  ✗ ${item.fredId} 订阅不符 source=${subscription?.sourceId} package=${subscription?.releasePackageId}（应 ${item.releasePackageId}） rule=${JSON.stringify(rule)}`,
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
        aggregate._max.obsDate! < daysAgo(MAX_LAG_DAYS)
      ) {
        console.error(`  ✗ ${item.fredId} 历史/时效不完整 count=${aggregate._count} first=${first} latest=${latest}`);
        errors += 1;
      } else {
        console.log(`  ✓ ${item.fredId} count=${aggregate._count} first=${first} latest=${latest} package=${item.releasePackageId}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-eia-energy-prices] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-eia-energy-prices] 通过");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Zillow 观测租金指数（ZORI，全美）抓取——自检
 *
 * npm run data:verify-zillow-zori
 * npm run data:verify-zillow-zori -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { ZILLOW_ZORI_INSTRUMENT, ZILLOW_ZORI_PACKAGE_ID } from "../../src/lib/data/scheduler/zillowZori/catalog";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";

/** Zillow 每月中旬发上月：最新观测允许滞后约 75 天 */
const MAX_LAG_DAYS = 75;

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  const code = ZILLOW_ZORI_INSTRUMENT.code;
  console.log(`[verify-zillow-zori] 目标仪器 ${code}`);

  const placement = resolveUsCatalogPlacement({ key: `mds:${code}` });
  if (placement.category !== "地产与建筑" || placement.subgroup !== "房价与可负担性") {
    console.error(`  ✗ 目录落点 ${placement.category}/${placement.subgroup}（应 地产与建筑/房价与可负担性）`);
    errors++;
  } else {
    console.log("  ✓ 目录落点 地产与建筑 > 房价与可负担性");
  }
  if (!useDb) {
    if (errors > 0) process.exit(1);
    console.log("[verify-zillow-zori] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.error(`  ✗ 缺 Instrument ${code}（先 data:seed-zillow-zori）`);
      process.exit(1);
    }
    const acq = readFetchAcquisition(inst.metadata);
    if (acq?.status !== "known") {
      console.error(`  ✗ fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
      errors++;
    }
    const md = (inst.metadata ?? {}) as Record<string, unknown>;
    const scrape = md.scrape as Record<string, unknown> | undefined;
    if (scrape?.provider !== "zillow_zori" || md.bootstrapOnly === true) {
      console.error(`  ✗ scrape.provider=${scrape?.provider ?? "无"} bootstrapOnly=${md.bootstrapOnly}`);
      errors++;
    } else {
      console.log(`  ✓ scrape.provider=zillow_zori · url=${scrape.url}`);
    }

    const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
    const rule = sub?.releaseRule as { type?: string; intervalHours?: number } | undefined;
    if (!sub?.enabled || rule?.type !== "probe_interval" || sub.releasePackageId !== ZILLOW_ZORI_PACKAGE_ID) {
      console.error(
        `  ✗ 订阅不符 enabled=${sub?.enabled} rule=${JSON.stringify(rule)} package=${sub?.releasePackageId}（应 ${ZILLOW_ZORI_PACKAGE_ID}）`,
      );
      errors++;
    } else {
      console.log(`  ✓ 订阅启用，probe_interval ${rule.intervalHours}h，发布包 ${sub.releasePackageId}`);
    }

    const agg = await prisma.macroObservation.aggregate({
      where: { instrumentId: inst.id },
      _count: true,
      _min: { obsDate: true, value: true },
      _max: { obsDate: true, value: true },
    });
    const first = agg._min.obsDate?.toISOString().slice(0, 10);
    const lagCutoff = new Date(Date.now() - MAX_LAG_DAYS * 86_400_000);
    if (
      agg._count < 130 ||
      !first ||
      first > ZILLOW_ZORI_INSTRUMENT.expectedStart ||
      !agg._max.obsDate ||
      agg._max.obsDate < lagCutoff
    ) {
      console.error(`  ✗ 历史/时效不完整 count=${agg._count} first=${first} latest=${agg._max.obsDate?.toISOString().slice(0, 10)}`);
      errors++;
    } else {
      console.log(`  ✓ 观测 ${agg._count} 条 · ${first} → ${agg._max.obsDate.toISOString().slice(0, 10)}`);
    }
    if ((agg._min.value ?? 0) < 300 || (agg._max.value ?? 0) > 10_000) {
      console.error(`  ✗ 值域异常 [${agg._min.value}, ${agg._max.value}]（应在 300–10000 美元/月）`);
      errors++;
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-zillow-zori] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-zillow-zori] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * 海关总署主要商品量值表——自检
 *
 * npm run data:verify-gacc-commodity
 * npm run data:verify-gacc-commodity -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  GACC_COMMODITY_CATEGORY,
  GACC_COMMODITY_CODES,
  GACC_DIRECTIONS,
  GACC_SOURCE,
  gaccCode,
  gaccCommodities,
} from "../../src/lib/data/scheduler/gaccCommodity/catalog";

/**
 * 单价值域粗筛：低于/高于这个区间基本可以断定单位算错了。
 * 上界取 1 亿美元 —— 本目录里单价最高的是出口船舶（实测 500 万–1250 万美元/艘），
 * 留出一个数量级余量，同时仍能挡住 100 倍级别的单位换算错误。
 */
const PRICE_RANGE = { min: 0.01, max: 100_000_000 };

async function main() {
  const useDb = process.argv.includes("--db");
  console.log(`[verify-gacc-commodity] 目录序列 ${GACC_COMMODITY_CODES.length} 条`);
  if (new Set(GACC_COMMODITY_CODES).size !== GACC_COMMODITY_CODES.length) {
    console.error("  ✗ 目录里有重复 code");
    process.exit(1);
  }
  const tooLong = GACC_COMMODITY_CODES.filter((c) => c.length > 48);
  if (tooLong.length) {
    console.error(`  ✗ code 超过 48 字符：${tooLong.join(", ")}`);
    process.exit(1);
  }
  if (!useDb) {
    console.log("[verify-gacc-commodity] catalog 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  let errors = 0;
  try {
    const items = await prisma.instrument.findMany({
      where: { code: { in: GACC_COMMODITY_CODES } },
      include: { dataSubscription: true },
    });
    const found = new Set(items.map((i) => i.code));
    const missing = GACC_COMMODITY_CODES.filter((c) => !found.has(c));
    if (missing.length) {
      console.error(`  ✗ 缺 ${missing.length} 条仪器（先 data:seed-gacc-commodity）：${missing.slice(0, 5).join(", ")}…`);
      errors += 1;
    }

    let noObs = 0;
    let badMeta = 0;
    for (const item of items) {
      const metadata = (item.metadata ?? {}) as Record<string, unknown>;
      const scrape = metadata.scrape as Record<string, unknown> | undefined;
      const acquisition = readFetchAcquisition(metadata);
      const count = await prisma.macroObservation.count({ where: { instrumentId: item.id } });
      if (!count) {
        noObs += 1;
        continue;
      }
      if (
        metadata.catalogCategory !== GACC_COMMODITY_CATEGORY ||
        metadata.countryCode !== "CN" ||
        metadata.bootstrapOnly === true ||
        acquisition?.status !== "known" ||
        scrape?.provider !== "gacc_commodity" ||
        item.dataSubscription?.sourceId !== GACC_SOURCE.id ||
        !item.dataSubscription.enabled
      ) {
        console.error(`  ✗ metadata/订阅异常 ${item.code}`);
        badMeta += 1;
      }
    }
    if (noObs) {
      console.error(`  ✗ ${noObs} 条序列没有任何观测（先 data:sync-gacc-commodity）`);
      errors += 1;
    }
    if (badMeta) errors += 1;
    if (!noObs && !badMeta && !missing.length) {
      console.log(`  ✓ ${items.length} 条仪器的 metadata、订阅、观测齐备`);
    }

    // 单价值域与量纲抽查
    const priceCodes = GACC_DIRECTIONS.flatMap((d) =>
      gaccCommodities(d).map((c) => gaccCode(d, c.slug, "price")),
    );
    const bad = await prisma.macroObservation.count({
      where: {
        instrument: { code: { in: priceCodes } },
        OR: [{ value: { lt: PRICE_RANGE.min } }, { value: { gt: PRICE_RANGE.max } }],
      },
    });
    if (bad > 0) {
      console.error(`  ✗ ${bad} 条单价观测超出 [${PRICE_RANGE.min}, ${PRICE_RANGE.max}] 值域`);
      errors += 1;
    } else {
      console.log("  ✓ 全部单价观测在合理值域内");
    }

    // 关键序列的量级锚点：进口铁矿砂单价应在 50–250 美元/吨
    const ironOre = await prisma.macroObservation.findMany({
      where: { instrument: { code: "gacc_cn_imp_iron_ore_price" } },
      orderBy: { obsDate: "desc" },
      take: 12,
      select: { obsDate: true, value: true },
    });
    if (ironOre.length < 6) {
      console.error(`  ✗ 进口铁矿砂单价只有 ${ironOre.length} 条近期观测`);
      errors += 1;
    } else {
      const outOfRange = ironOre.filter((o) => o.value < 50 || o.value > 250);
      if (outOfRange.length) {
        console.error(
          `  ✗ 进口铁矿砂单价 ${outOfRange.length} 条落在 50–250 美元/吨 之外（单位换算可能出错）`,
        );
        errors += 1;
      } else {
        console.log(
          `  ✓ 进口铁矿砂单价近 12 期 ${ironOre.at(-1)!.value}–${ironOre[0]!.value} 美元/吨，量级正确`,
        );
      }
    }

    const first = await prisma.macroObservation.findFirst({
      where: { instrument: { code: { in: GACC_COMMODITY_CODES } } },
      orderBy: { obsDate: "asc" },
      select: { obsDate: true },
    });
    const last = await prisma.macroObservation.findFirst({
      where: { instrument: { code: { in: GACC_COMMODITY_CODES } } },
      orderBy: { obsDate: "desc" },
      select: { obsDate: true },
    });
    console.log(
      `  ✓ 观测区间 ${first?.obsDate.toISOString().slice(0, 10)} → ${last?.obsDate.toISOString().slice(0, 10)}`,
    );

    // 旧的商务部「商品构成」序列必须已经清干净
    const legacy = await prisma.instrument.count({
      where: { code: { startsWith: "mofcom_cn_trade_" }, shortName: { startsWith: "外贸：商品构成" } },
    });
    if (legacy > 0) {
      console.error(`  ✗ 仍有 ${legacy} 条商务部商品构成序列未清理（跑 data:drop-mofcom-composition）`);
      errors += 1;
    } else {
      console.log("  ✓ 商务部商品构成序列已清理");
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors) {
    console.error(`[verify-gacc-commodity] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-gacc-commodity] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

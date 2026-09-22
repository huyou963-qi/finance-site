/**
 * 黄金现货 / COMEX 期货、NYMEX WTI 原油期货标准序列——自检
 *
 * npm run data:verify-gold-prices           # 静态：目录、发布包、退役登记、模板布局一致
 * npm run data:verify-gold-prices -- --db   # 加查仪器、订阅、包、历史起点、最新观测、目录可见
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { GOLD_ANALYSIS_SERIES, GOLD_ANALYSIS_TEMPLATE_EXTRAS } from "../../src/lib/data/goldAnalysisLayout";
import { SUPERSEDED_KEEP_HISTORY_CODES } from "../../src/lib/data/retiredIndicators";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { GOLD_PRICE_INSTRUMENTS, GOLD_SUPERSEDED_BY } from "../../src/lib/data/scheduler/goldPrices/catalog";
import { OIL_PRICE_INSTRUMENTS, WTI_FUTURES_CODE } from "../../src/lib/data/scheduler/oilPrices/catalog";
import { REGIME_NOWCAST_INPUT_CODES } from "../../src/lib/quant/macroRegime";
import { RELEASE_PACKAGE_CATALOG } from "../../src/lib/data/scheduler/releasePackageCatalog";
import { YAHOO_GOLD_SERIES } from "../../src/lib/data/scheduler/yahooGold/catalog";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";
import { US_OVERVIEW_SERIES } from "../../src/lib/data/usOverviewLayout";
import { US_OVERVIEW_STANDARD_SERIES } from "../../src/lib/data/usOverviewStandardSeries";

async function main() {
  let errors = 0;
  const fail = (msg: string) => {
    console.error(`  ✗ ${msg}`);
    errors++;
  };
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);

  const codes = GOLD_PRICE_INSTRUMENTS.map((r) => r.code);
  for (const row of GOLD_PRICE_INSTRUMENTS) {
    const pkg = RELEASE_PACKAGE_CATALOG.find((p) => p.id === row.packageId);
    const members = pkg?.members.instrumentCodes ?? [];
    if (!members.includes(row.code)) fail(`${row.code} 不在发布包 ${row.packageId} 的成员里`);
    const others = RELEASE_PACKAGE_CATALOG.filter((p) => p.id !== row.packageId && p.members.instrumentCodes?.includes(row.code));
    if (others.length > 0) fail(`${row.code} 同时挂在 ${others.map((p) => p.id).join(", ")}`);
    const placement = resolveUsCatalogPlacement({ key: `mds:${row.code}` });
    if (placement.category !== "通胀与价格" || placement.subgroup !== "黄金与贵金属") {
      fail(`${row.code} 目录归类 ${JSON.stringify(placement)}（应 通胀与价格/黄金与贵金属）`);
    } else {
      ok(`${row.code} → ${row.packageId} · 通胀与价格/黄金与贵金属`);
    }
  }

  for (const row of OIL_PRICE_INSTRUMENTS) {
    const pkg = RELEASE_PACKAGE_CATALOG.find((p) => p.id === row.packageId);
    if (!pkg?.members.instrumentCodes?.includes(row.code)) fail(`${row.code} 不在发布包 ${row.packageId} 的成员里`);
    const placement = resolveUsCatalogPlacement({ key: `mds:${row.code}` });
    if (placement.category !== "通胀与价格" || placement.subgroup !== "通胀预期与能源") {
      fail(`${row.code} 目录归类 ${JSON.stringify(placement)}（应 通胀与价格/通胀预期与能源）`);
    } else {
      ok(`${row.code} → ${row.packageId} · 通胀与价格/通胀预期与能源`);
    }
  }
  if (!REGIME_NOWCAST_INPUT_CODES.includes(WTI_FUTURES_CODE)) fail(`高频判断未使用 ${WTI_FUTURES_CODE}`);
  if (REGIME_NOWCAST_INPUT_CODES.includes("sched_fred_DCOILWTICO")) fail("高频判断仍在用周更的 sched_fred_DCOILWTICO");

  // 旧列：已登记为「被取代、保留历史」，且不再由任何目录/包/布局管理（否则 seed 会把订阅改回去）
  const superseded = Object.keys(GOLD_SUPERSEDED_BY);
  const unregistered = superseded.filter((c) => !SUPERSEDED_KEEP_HISTORY_CODES.includes(c));
  if (unregistered.length > 0) fail(`未登记到 SUPERSEDED_KEEP_HISTORY：${unregistered.join(", ")}`);
  const stillManaged = superseded.filter(
    (c) =>
      YAHOO_GOLD_SERIES.some((r) => r.code === c) ||
      RELEASE_PACKAGE_CATALOG.some((p) => p.members.instrumentCodes?.includes(c)) ||
      GOLD_ANALYSIS_SERIES.some((r) => r.code === c) ||
      US_OVERVIEW_SERIES.some((r) => r.code === c),
  );
  if (stillManaged.length > 0) fail(`被取代旧列仍被目录/包/布局引用：${stillManaged.join(", ")}`);
  else ok(`被取代旧列 ${superseded.join(", ")} 已从目录/包/布局移除`);

  // 模板：黄金分析与 US_Overview 引用标准键，期现差/SPX-GLD 运算指向标准键
  const goldKeys = new Set(GOLD_ANALYSIS_TEMPLATE_EXTRAS.map((r) => r.key));
  const basis = GOLD_ANALYSIS_TEMPLATE_EXTRAS.find((r) => r.derived?.id === "gold-basis")?.derived;
  const usKeys = new Set(US_OVERVIEW_STANDARD_SERIES.map((r) => r.key));
  for (const code of codes) {
    if (!goldKeys.has(`mds:${code}`)) fail(`黄金分析模板缺 mds:${code}`);
  }
  if (basis?.leftKey !== `mds:${codes[1]}` || basis?.rightKey !== `mds:${codes[0]}`) {
    fail(`期现差运算 ${basis?.leftKey} − ${basis?.rightKey}（应 期货 − 现货标准键）`);
  }
  if (!usKeys.has(`mds:${codes[1]}`)) fail(`US_Overview 模板缺 mds:${codes[1]}`);
  if (errors === 0) ok("模板引用标准键（期现差 = 期货 − 现货）");

  if (process.argv.includes("--db")) {
    const prisma = new PrismaClient();
    try {
      for (const row of [...GOLD_PRICE_INSTRUMENTS, ...OIL_PRICE_INSTRUMENTS]) {
        const inst = await prisma.instrument.findUnique({ where: { code: row.code }, include: { dataSubscription: true } });
        if (!inst) {
          fail(`缺 Instrument ${row.code}`);
          continue;
        }
        if (readFetchAcquisition(inst.metadata)?.status !== "known") fail(`${row.code} fetchAcquisition 非 known`);
        const sub = inst.dataSubscription;
        if (!sub?.enabled || sub.sourceId !== row.source.id || sub.releasePackageId !== row.packageId) {
          fail(`${row.code} 订阅=${sub?.sourceId ?? "无"}/${sub?.enabled}/${sub?.releasePackageId ?? "无包"}（应 ${row.source.id}/启用/${row.packageId}）`);
        }
        const agg = await prisma.macroObservation.aggregate({
          where: { instrumentId: inst.id },
          _count: true,
          _min: { obsDate: true },
          _max: { obsDate: true },
        });
        const first = agg._min.obsDate?.toISOString().slice(0, 10);
        const last = await prisma.macroObservation.findFirst({ where: { instrumentId: inst.id }, orderBy: { obsDate: "desc" } });
        const lagDays = last ? (Date.now() - last.obsDate.getTime()) / 86_400_000 : Infinity;
        if (!first || first > row.expectedStart) fail(`${row.code} 历史起点 ${first ?? "无"}（应 ≤ ${row.expectedStart}，全量回填不完整）`);
        else if (lagDays > 7) fail(`${row.code} 最新观测 ${last?.obsDate.toISOString().slice(0, 10)}（滞后 ${Math.round(lagDays)} 天）`);
        else if (last!.value < 30 || last!.value > 20_000) fail(`${row.code} 最新值 ${last!.value} 超出合理区间`);
        else ok(`${row.code} · ${agg._count} 条 · ${first} → ${last!.obsDate.toISOString().slice(0, 10)}=${last!.value}`);
        const hidden = await prisma.macroCatalogExcludedKey.findUnique({ where: { catalogKey: `mds:${row.code}` } });
        if (hidden) fail(`${row.code} 被目录 tombstone 隐藏`);
      }
      for (const code of superseded) {
        const inst = await prisma.instrument.findUnique({ where: { code }, include: { dataSubscription: true } });
        if (!inst) continue;
        if (inst.dataSubscription?.enabled) fail(`被取代旧列 ${code} 订阅仍启用`);
        const n = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
        ok(`${code} 订阅已停用，保留 ${n} 条历史观测`);
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  if (errors > 0) {
    console.error(`[verify-gold-prices] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-gold-prices] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

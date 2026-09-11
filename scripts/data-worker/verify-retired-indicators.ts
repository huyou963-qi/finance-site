/**
 * 退役指标 + 宏观数据库约束自检
 *
 * npm run data:verify-retired-indicators
 * npm run data:verify-retired-indicators -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { mergedUsovFredMap } from "../../src/lib/data/scheduler/usovFredMap";
import { USOV_COMPOSITE_FRED } from "../../src/lib/data/scheduler/usovCompositeFred";
import { FISCAL_COMPOSITE_FRED } from "../../src/lib/data/scheduler/fiscalCompositeFred";
import { FISCAL_TREASURY_COMPOSITE } from "../../src/lib/data/scheduler/fiscalTreasuryComposite";
import { FISCAL_FRED_YOY_SERIES } from "../../src/lib/data/scheduler/fiscalFredSeedCatalog";
import {
  RETIRED_INDICATOR_CODES,
  RETIRED_INDICATOR_REPLACEMENTS,
} from "../../src/lib/data/retiredIndicators";
import { US_OVERVIEW_SERIES } from "../../src/lib/data/usOverviewLayout";
import { GOLD_ANALYSIS_SERIES } from "../../src/lib/data/goldAnalysisLayout";
import { getFredCatalogCached, unifiedKeyInAllowlist } from "../../src/lib/data/fredCatalog";

function baseCode(key: string): string {
  const raw = key.split("::")[0]!;
  return raw.startsWith("fred:") ? `sched_fred_${raw.slice(5)}` : raw.slice(4);
}

async function main() {
  let errors = 0;
  const fail = (msg: string) => {
    console.error(`  ✗ ${msg}`);
    errors++;
  };

  // 代码侧：不再有库内复合 / 调度器变换 / xlsx 派生列
  const composites = [
    ...Object.keys(USOV_COMPOSITE_FRED),
    ...Object.keys(FISCAL_COMPOSITE_FRED),
    ...Object.keys(FISCAL_TREASURY_COMPOSITE),
    ...FISCAL_FRED_YOY_SERIES.map((r) => r.code),
  ];
  if (composites.length > 0) fail(`仍有库内计算型定义：${composites.join(", ")}`);
  else console.log("  ✓ 无库内复合/调度器变换定义");
  const mapped = Object.keys(mergedUsovFredMap()).filter((code) => RETIRED_INDICATOR_CODES.includes(code));
  if (mapped.length > 0) fail(`退役序列仍挂 FRED 映射：${mapped.join(", ")}`);
  const inLayout = [...US_OVERVIEW_SERIES, ...GOLD_ANALYSIS_SERIES].filter((row) =>
    RETIRED_INDICATOR_CODES.includes(row.code),
  );
  if (inLayout.length > 0) fail(`xlsx 布局仍含退役列：${inLayout.map((r) => r.code).join(", ")}`);
  else console.log("  ✓ xlsx 布局已移除退役列");

  if (!process.argv.includes("--db")) {
    console.log(errors > 0 ? "[verify-retired-indicators] 失败" : "[verify-retired-indicators] 通过（加 --db 检查数据库）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const left = await prisma.instrument.findMany({
      where: { code: { in: RETIRED_INDICATOR_CODES } },
      select: { code: true },
    });
    if (left.length > 0) fail(`退役仪器仍在库：${left.map((r) => r.code).join(", ")}`);
    else console.log(`  ✓ ${RETIRED_INDICATOR_CODES.length} 条退役仪器已删除`);

    const tombstones = await prisma.macroCatalogExcludedKey.count({
      where: { catalogKey: { in: RETIRED_INDICATOR_CODES.map((code) => `mds:${code}`) } },
    });
    if (tombstones !== RETIRED_INDICATOR_CODES.length) fail(`tombstone ${tombstones}/${RETIRED_INDICATOR_CODES.length}`);
    else console.log("  ✓ 目录 tombstone 齐全");

    // 库侧约束：不得再有复合订阅或派生标记的仪器
    const compositeSubs = await prisma.dataSubscription.findMany({
      where: { OR: [{ sourceSeriesKey: { startsWith: "composite:" } }, { sourceSeriesKey: "COMPOSITE" }] },
      select: { instrument: { select: { code: true } } },
    });
    if (compositeSubs.length > 0) fail(`仍有复合订阅：${compositeSubs.map((s) => s.instrument.code).join(", ")}`);
    else console.log("  ✓ 无复合订阅");
    const derivedRows = (await prisma.$queryRawUnsafe(
      `SELECT code FROM mds."Instrument" WHERE metadata ? 'derivation' OR metadata ? 'compositeSpec'`,
    )) as { code: string }[];
    if (derivedRows.length > 0) fail(`仍有派生标记仪器：${derivedRows.map((r) => r.code).join(", ")}`);
    else console.log("  ✓ 无派生标记仪器");

    const retiredKeyPattern = RETIRED_INDICATOR_CODES.map((code) => `"mds:${code}`);
    const system = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
    const systemText = JSON.stringify(system?.prefs ?? {});
    const users = await prisma.userMacroChartPrefs.findMany();
    const dirtyUsers = users.filter((u) => retiredKeyPattern.some((k) => JSON.stringify(u.prefs).includes(k)));
    const layout = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
    const layoutText = JSON.stringify(layout?.layout ?? {});
    if (retiredKeyPattern.some((k) => systemText.includes(k))) fail("系统模板仍引用退役键");
    else console.log("  ✓ 系统模板无退役键");
    if (dirtyUsers.length > 0) fail(`${dirtyUsers.length} 个用户工作区/模板仍引用退役键`);
    else console.log("  ✓ 用户工作区/模板无退役键");
    if (retiredKeyPattern.some((k) => layoutText.includes(k))) fail("目录布局仍含退役键");
    else console.log("  ✓ 目录布局无退役键");

    // 替代键：基础序列须在库、订阅启用、有观测，并在目录允许列表内（否则模板会被过滤掉）
    const { allowlist } = await getFredCatalogCached();
    const targets = new Set<string>();
    for (const repl of Object.values(RETIRED_INDICATOR_REPLACEMENTS)) {
      if (!repl) continue;
      if ("derived" in repl) {
        targets.add(repl.derived.leftKey);
        targets.add(repl.derived.rightKey);
      } else {
        targets.add(repl.key);
      }
    }
    for (const key of targets) {
      const code = baseCode(key);
      const inst = await prisma.instrument.findUnique({ where: { code }, include: { dataSubscription: true } });
      const count = inst ? await prisma.macroObservation.count({ where: { instrumentId: inst.id } }) : 0;
      if (!inst || count === 0) {
        fail(`替代基础序列 ${key}（${code}）缺仪器或观测`);
      } else if (!unifiedKeyInAllowlist(key, allowlist)) {
        fail(`替代键 ${key} 不在目录允许列表（模板会过滤掉）`);
      } else if (!inst.dataSubscription?.enabled) {
        // xlsx 历史存量（如 CME 授权待定的 COMEX 活跃合约/库存）：可画但不更新，提示而非失败
        console.warn(`  ⚠ ${key} ← ${code} 无启用订阅（历史存量 ${count} 条，不会自动更新）`);
      } else {
        console.log(`  ✓ ${key} ← ${code} · ${inst.dataSubscription.releasePackageId ?? "无包"} · ${count} 条`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-retired-indicators] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-retired-indicators] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

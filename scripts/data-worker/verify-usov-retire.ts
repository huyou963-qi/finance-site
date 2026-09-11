/**
 * US_Overview 退役序列自检
 *
 * npm run data:verify-usov-retire
 * npm run data:verify-usov-retire -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { mergedUsovFredMap } from "../../src/lib/data/scheduler/usovFredMap";
import {
  RETIRED_USOV_CODES,
  RETIRED_USOV_REPLACEMENTS,
} from "../../src/lib/data/usOverviewStandardSeries";
import { US_OVERVIEW_SERIES } from "../../src/lib/data/usOverviewLayout";

async function main() {
  let errors = 0;
  const fail = (msg: string) => {
    console.error(`  ✗ ${msg}`);
    errors++;
  };

  const mapped = Object.keys(mergedUsovFredMap()).filter((code) => RETIRED_USOV_CODES.includes(code));
  if (mapped.length > 0) fail(`退役序列仍挂 FRED 映射：${mapped.join(", ")}`);
  else console.log("  ✓ 退役序列无 FRED 映射");
  const inLayout = US_OVERVIEW_SERIES.filter((row) => RETIRED_USOV_CODES.includes(row.code));
  if (inLayout.length > 0) fail(`xlsx 布局仍含退役列：${inLayout.map((r) => r.code).join(", ")}`);
  else console.log("  ✓ xlsx 布局已移除退役列");

  if (!process.argv.includes("--db")) {
    console.log(errors > 0 ? "[verify-usov-retire] 失败" : "[verify-usov-retire] 通过（加 --db 检查数据库）");
    if (errors > 0) process.exit(1);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const left = await prisma.instrument.findMany({
      where: { code: { in: RETIRED_USOV_CODES } },
      select: { code: true },
    });
    if (left.length > 0) fail(`退役仪器仍在库：${left.map((r) => r.code).join(", ")}`);
    else console.log(`  ✓ ${RETIRED_USOV_CODES.length} 条退役仪器已删除`);

    const tombstones = await prisma.macroCatalogExcludedKey.count({
      where: { catalogKey: { in: RETIRED_USOV_CODES.map((code) => `mds:${code}`) } },
    });
    if (tombstones !== RETIRED_USOV_CODES.length) fail(`tombstone ${tombstones}/${RETIRED_USOV_CODES.length}`);
    else console.log("  ✓ 目录 tombstone 齐全");

    const retiredKeyPattern = RETIRED_USOV_CODES.map((code) => `"mds:${code}"`);
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

    // 标准替代：FRED 虚拟键 → sched_fred_* 须在库、订阅启用、归属发布包；mds 替代须在库并有订阅
    for (const [code, repl] of Object.entries(RETIRED_USOV_REPLACEMENTS)) {
      if (!repl) continue;
      const targetCode = repl.key.startsWith("fred:")
        ? `sched_fred_${repl.key.slice(5).split("::")[0]}`
        : repl.key.slice(4);
      const inst = await prisma.instrument.findUnique({
        where: { code: targetCode },
        include: { dataSubscription: true },
      });
      const sub = inst?.dataSubscription;
      const count = inst ? await prisma.macroObservation.count({ where: { instrumentId: inst.id } }) : 0;
      if (!inst || !sub?.enabled || !sub.releasePackageId || count === 0) {
        fail(`${code} → ${repl.key}：${targetCode} 缺仪器/订阅/发布包/观测`);
      } else {
        console.log(`  ✓ ${code} → ${repl.key}（${targetCode} · ${sub.releasePackageId} · ${count} 条）`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-usov-retire] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-usov-retire] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

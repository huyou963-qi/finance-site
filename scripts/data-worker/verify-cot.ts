/**
 * CFTC COT 数据自检
 * npm run data:verify-cot
 * npm run data:verify-cot -- --db
 * npm run data:verify-cot -- --live  # 全部品种逐值对照官方完整历史
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
} from "../../src/lib/data/cot/cotProductCatalog";
import { fetchCftcDisaggregatedRows } from "../../src/lib/data/scheduler/cftcCot/client";
import { extractMmSeries } from "../../src/lib/data/scheduler/cftcCot/match";
import { buildCotReportFromDb } from "../../src/lib/data/cot/buildCotReport";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const checkLive = process.argv.includes("--live");
const checkDb = process.argv.includes("--db") || checkLive;

async function main() {
  let missing = 0;
  for (const p of COT_MM_PRODUCTS) {
    for (const metric of ["long", "short"] as const) {
      const code = cotInstrumentCode(p.slug, metric);
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.log(`✗ 缺少仪器 ${code}`);
        missing++;
        continue;
      }
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub) {
        console.log(`✗ 缺少订阅 ${code}`);
        missing++;
      }
    }
  }

  if (missing > 0) {
    console.log(`\n请先运行: npm run data:seed-cot`);
    process.exit(1);
  }

  console.log(`✓ ${COT_MM_PRODUCTS.length} 品种 × 2 指标仪器/订阅齐全`);

  if (!checkDb) return;

  if (checkLive) {
    const rows = await fetchCftcDisaggregatedRows("2006-01-01", { requireCompleteHistory: true });
    let errors = 0;
    for (const product of COT_MM_PRODUCTS) {
      const expected = extractMmSeries(rows, product.match);
      if (!expected.length) throw new Error(`官方无匹配数据: ${product.slug}`);
      for (const metric of ["long", "short"] as const) {
        const code = cotInstrumentCode(product.slug, metric);
        const points = await prisma.macroObservation.findMany({ where: { instrument: { code } } });
        const byDate = new Map(points.map(p => [p.obsDate.toISOString().slice(0, 10), p.value]));
        let missing = 0;
        let changed = 0;
        for (const point of expected) {
          const value = byDate.get(point.obsDate.toISOString().slice(0, 10));
          if (value == null) missing++;
          else if (value !== point[metric]) changed++;
        }
        errors += missing + changed;
        console.log(`${code}: 官方 ${expected.length} 周, 缺失 ${missing}, 值差异 ${changed}`);
      }
    }
    if (errors) throw new Error(`COT 完整历史与官方不一致: ${errors} 条`);
    console.log("✓ 全部品种多空完整历史逐值对照官方通过");
  }

  // 金价模板的净持仓曾单独导入长历史，多/空必须覆盖其每一个日期。
  const goldCodes = ["cot_mm_gold_long", "cot_mm_gold_short", "goldov_c06_mm_net"];
  const gold = await prisma.instrument.findMany({ where: { code: { in: goldCodes } } });
  const byCode = new Map<string, Map<string, number>>();
  for (const inst of gold) {
    const points = await prisma.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
    byCode.set(inst.code, new Map(points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value])));
    console.log(`${inst.code}: ${points.length} 周, ${points[0]?.obsDate.toISOString().slice(0, 10) ?? "—"} 至 ${points.at(-1)?.obsDate.toISOString().slice(0, 10) ?? "—"}`);
  }
  const longs = byCode.get(goldCodes[0]!);
  const shorts = byCode.get(goldCodes[1]!);
  let historyErrors = 0;
  for (const [date, net] of byCode.get(goldCodes[2]!) ?? []) {
    const long = longs?.get(date);
    const short = shorts?.get(date);
    if (long == null || short == null || Math.abs(long - short - net) > 1e-8) historyErrors++;
  }
  if (historyErrors) throw new Error(`Gold COT 历史缺失或 long-short != net: ${historyErrors} 周`);
  console.log("✓ Gold COT 多空历史覆盖净持仓全部日期，long − short = net");

  const report = await buildCotReportFromDb(prisma);
  const withData = report.rows.filter((r) => r.long != null && r.short != null);
  console.log(`\n报告日: ${report.reportDate ?? "—"} (${report.reportDateLabel ?? "—"})`);
  console.log(`有数据品种: ${withData.length} / ${report.rows.length}`);

  for (const r of report.rows) {
    const flag = r.long != null ? "✓" : "✗";
    console.log(
      `  ${flag} ${r.label.padEnd(22)} long=${r.long?.toLocaleString() ?? "—"} short=${r.short?.toLocaleString() ?? "—"} net=${r.net?.toLocaleString() ?? "—"}`,
    );
  }

  if (withData.length < report.rows.length) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

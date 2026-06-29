/**
 * CFTC COT 数据自检
 * npm run data:verify-cot
 * npm run data:verify-cot -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  COT_MM_PRODUCTS,
  cotInstrumentCode,
} from "../../src/lib/data/cot/cotProductCatalog";
import { buildCotReportFromDb } from "../../src/lib/data/cot/buildCotReport";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const checkDb = process.argv.includes("--db");

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

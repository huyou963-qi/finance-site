/**
 * Phase 2 自检：BIS / World Bank 适配器 + 订阅计数
 *
 * npm run data:verify-phase2
 * npm run data:verify-phase2 -- --live
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchBisIncremental } from "../../src/lib/data/scheduler/adapters/bisAdapter";
import { fetchWorldBankIncremental } from "../../src/lib/data/scheduler/adapters/worldbankAdapter";
import { parseBisCsvObservations } from "../../src/lib/data/scheduler/adapters/bisCsv";

loadEnvConfig(process.cwd());

const SAMPLE_BIS_CSV = `TIME_PERIOD,OBS_VALUE
2024-Q1,12.5
2024-Q2,12.8`;

async function main() {
  const live = process.argv.includes("--live");
  let errors = 0;

  console.log("[verify-phase2] BIS CSV 解析");
  const pts = parseBisCsvObservations(SAMPLE_BIS_CSV);
  if (pts.length === 2 && pts[1]!.value === 12.8) {
    console.log("  ✓ parseBisCsvObservations");
  } else {
    console.error("  ✗ BIS CSV 解析失败");
    errors++;
  }

  if (live) {
    console.log("[verify-phase2] BIS  live WS_DSR Q.US.H");
    try {
      const bis = await fetchBisIncremental("WS_DSR:Q.US.H", "2020-01-01");
      console.log(`  ✓ BIS 观测 ${bis.points.length} 条，最新 ${bis.sourceLatestObsDate?.toISOString().slice(0, 10)}`);
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    }

    console.log("[verify-phase2] World Bank live CN:FP.CPI.TOTL.ZG");
    try {
      const wb = await fetchWorldBankIncremental("CN:FP.CPI.TOTL.ZG", "2015-01-01");
      console.log(`  ✓ WB 观测 ${wb.points.length} 条`);
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  if (process.argv.includes("--db")) {
    const prisma = new PrismaClient();
    try {
      const bySource = await prisma.dataSubscription.groupBy({
        by: ["sourceId"],
        where: { enabled: true },
        _count: true,
      });
      console.log("[verify-phase2] 订阅分布");
      for (const row of bySource) {
        console.log(`  ${row.sourceId}: ${row._count}`);
      }
      const total = bySource.reduce((s, r) => s + r._count, 0);
      if (total >= 50) console.log(`  ✓ enabled 订阅 ${total} 条 (Phase 2 目标 ≥50)`);
      else console.warn(`  ⚠ enabled 订阅 ${total} 条，运行 npm run data:seed-phase2`);
    } catch (e) {
      console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
      errors++;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-phase2] 通过（加 --live --db 做完整检查）");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

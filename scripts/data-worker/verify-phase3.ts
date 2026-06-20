/**
 * Phase 3 自检
 *
 * npm run data:verify-phase3
 * npm run data:verify-phase3 -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { applyYoYPercent } from "../../src/lib/data/scheduler/fredTransform";
import { fredTransformForInstrument } from "../../src/lib/data/scheduler/fredTransform";

loadEnvConfig(process.cwd());

async function main() {
  let errors = 0;
  console.log("[verify-phase3] YoY 变换");
  const yoy = applyYoYPercent([
    { obsDate: new Date("2024-01-01"), value: 110 },
    { obsDate: new Date("2025-01-01"), value: 121 },
  ]);
  if (yoy.length === 1 && Math.abs(yoy[0]!.value - 10) < 0.01) {
    console.log("  ✓ applyYoYPercent");
  } else {
    console.error("  ✗ YoY 计算异常", yoy);
    errors++;
  }
  if (fredTransformForInstrument("usov_c16_cpi_yoy") === "yoy_pct") {
    console.log("  ✓ usov yoy 识别");
  } else {
    errors++;
  }

  if (process.argv.includes("--db")) {
    const prisma = new PrismaClient();
    try {
      const actions = await import("../../src/lib/data/scheduler/adminActions");
      const runs = await actions.listRecentFetchRuns(prisma, { limit: 5 });
      console.log(`[verify-phase3] FetchRun 样本 ${runs.length} 条`);
      const wb = await prisma.dataSubscription.count({ where: { sourceId: "worldbank" } });
      console.log(`  worldbank 订阅 ${wb} 条`);
      if (runs.length > 0) console.log("  ✓ adminActions.listRecentFetchRuns");
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (errors > 0) process.exit(1);
  console.log("[verify-phase3] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

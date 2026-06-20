/**
 * Phase 4 自检
 *
 * npm run data:verify-phase4
 * npm run data:verify-phase4 -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  listOverviewInstrumentCodes,
  overviewTemplateForInstrument,
} from "../../src/lib/data/scheduler/adapters/overviewXlsxAdapter";
import { mergedInvestingCalendarByFred } from "../../src/lib/data/scheduler/investingEventMap";
import { collectLagAlerts } from "../../src/lib/data/scheduler/lagAlerts";

loadEnvConfig(process.cwd());

async function main() {
  let errors = 0;
  console.log("[verify-phase4] Overview 模板");
  if (overviewTemplateForInstrument("chov_c01_gdp_real_yoy_q") === "china") {
    console.log("  ✓ chov 模板识别");
  } else {
    errors++;
  }
  if (overviewTemplateForInstrument("jpov_c01_nikkei225") === "japan") {
    console.log("  ✓ jpov 模板识别");
  } else {
    errors++;
  }
  const cnCodes = listOverviewInstrumentCodes("china");
  if (cnCodes.length >= 20) {
    console.log(`  ✓ 中国 layout ${cnCodes.length} 条`);
  } else {
    console.error(`  ✗ 中国 layout 仅 ${cnCodes.length} 条`);
    errors++;
  }

  console.log("[verify-phase4] 日历映射合并");
  const merged = mergedInvestingCalendarByFred();
  if (merged.CPIAUCSL?.keywords?.length) {
    console.log("  ✓ mergedInvestingCalendarByFred");
  } else {
    errors++;
  }

  console.log("[verify-phase4] 滞后告警");
  const prisma = new PrismaClient();
  try {
    const alerts = await collectLagAlerts(prisma, 14);
    console.log(`  样本告警 ${alerts.length} 条`);
    console.log("  ✓ collectLagAlerts");
  } catch (e) {
    console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
    errors++;
  }

  if (process.argv.includes("--db")) {
    try {
      const cn = await prisma.dataSubscription.count({ where: { sourceId: "overview-china" } });
      const jp = await prisma.dataSubscription.count({ where: { sourceId: "overview-japan" } });
      const leg = await prisma.dataSubscription.count({ where: { sourceId: "legacy-m" } });
      console.log(`[verify-phase4] DB overview-china ${cn} · overview-japan ${jp} · legacy-m ${leg}`);
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      errors++;
    }
  }

  await prisma.$disconnect();

  if (errors > 0) {
    console.error("[verify-phase4] 失败");
    process.exit(1);
  }
  console.log("[verify-phase4] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

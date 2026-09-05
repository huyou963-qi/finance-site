/**
 * FINRA 客户融资余额统计（Margin Statistics）——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-finra-margin-debt
 * npm run data:sync-finra-margin-debt -- --fixture=.data/margin-statistics-sample.xlsx
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchFinraMarginStatisticsWorkbook } from "../../src/lib/data/scheduler/finraMarginDebt/client";
import { parseFinraMarginStatistics } from "../../src/lib/data/scheduler/finraMarginDebt/parseMarginStatistics";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { FINRA_MARGIN_STATISTICS_SERIES } from "../../src/lib/data/scheduler/finraMarginDebt/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const wb = await fetchFinraMarginStatisticsWorkbook(fixturePath ? { fixturePath } : undefined);
  const { pointsBySeries, latestObsDateBySeries, skippedInvalid } = parseFinraMarginStatistics(wb);
  console.log(
    `[sync-finra-margin-debt] ${fixturePath ? `fixture=${fixturePath} ` : "live "}跳过无效 ${skippedInvalid}`,
  );

  for (const row of FINRA_MARGIN_STATISTICS_SERIES) {
    const points = pointsBySeries.get(row.seriesKey) ?? [];
    const latest = latestObsDateBySeries.get(row.seriesKey);
    console.log(
      `  ${row.instrumentCode}：解析 ${points.length} 点，最新 ${latest?.toISOString().slice(0, 10) ?? "无"}`,
    );

    const inst = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!inst) {
      throw new Error(`未找到仪器 ${row.instrumentCode}，请先 npm run data:seed-finra-margin-debt`);
    }
    const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
    console.log(`    完成：upserted=${upserted} skipped=${skipped}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

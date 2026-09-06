/**
 * Ritter 美股 IPO 月度统计——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-ritter-ipo
 * npm run data:sync-ritter-ipo -- --fixture=.data/IPOALL.xlsx
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchRitterIpoWorkbook } from "../../src/lib/data/scheduler/ritterIpo/client";
import { parseRitterIpoAll } from "../../src/lib/data/scheduler/ritterIpo/parseIpoAll";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { RITTER_IPO_SERIES } from "../../src/lib/data/scheduler/ritterIpo/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const wb = await fetchRitterIpoWorkbook(fixturePath ? { fixturePath } : undefined);
  const { pointsBySeries, latestObsDateBySeries, skippedInvalid } = parseRitterIpoAll(wb);
  console.log(
    `[sync-ritter-ipo] ${fixturePath ? `fixture=${fixturePath} ` : "live "}跳过无效 ${skippedInvalid}`,
  );

  for (const row of RITTER_IPO_SERIES) {
    const points = pointsBySeries.get(row.seriesKey) ?? [];
    const latest = latestObsDateBySeries.get(row.seriesKey);
    console.log(
      `  ${row.instrumentCode}：解析 ${points.length} 点，最新 ${latest?.toISOString().slice(0, 10) ?? "无"}`,
    );

    const inst = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!inst) {
      throw new Error(`未找到仪器 ${row.instrumentCode}，请先 npm run data:seed-ritter-ipo`);
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

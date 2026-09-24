/**
 * Zillow 观测租金指数（ZORI，全美）——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-zillow-zori
 * npm run data:sync-zillow-zori -- --fixture=.data/zillow-zori-sample.csv
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchZillowZoriCsv } from "../../src/lib/data/scheduler/zillowZori/client";
import { parseZoriCsv } from "../../src/lib/data/scheduler/zillowZori/parseZoriCsv";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { ZILLOW_ZORI_INSTRUMENT } from "../../src/lib/data/scheduler/zillowZori/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const text = await fetchZillowZoriCsv(fixturePath ? { fixturePath } : undefined);
  const { points, latestObsDate, skippedInvalid } = parseZoriCsv(text);
  console.log(
    `[sync-zillow-zori] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({ where: { code: ZILLOW_ZORI_INSTRUMENT.code } });
  if (!inst) throw new Error("未找到仪器，请先 npm run data:seed-zillow-zori");

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-zillow-zori] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

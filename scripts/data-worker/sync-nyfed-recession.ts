/**
 * NY Fed 衰退概率——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-nyfed-recession
 * npm run data:sync-nyfed-recession -- --fixture=.data/nyfed-allmonth-sample.xls
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchNyFedRecessionWorkbook } from "../../src/lib/data/scheduler/nyFedRecession/client";
import { parseRecProbWorkbook } from "../../src/lib/data/scheduler/nyFedRecession/parseRecProb";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { NYFED_RECESSION_INSTRUMENT } from "../../src/lib/data/scheduler/nyFedRecession/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const wb = await fetchNyFedRecessionWorkbook(fixturePath ? { fixturePath } : undefined);
  const { points, latestObsDate, skippedInvalid } = parseRecProbWorkbook(wb);
  console.log(
    `[sync-nyfed-recession] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: NYFED_RECESSION_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-nyfed-recession");
  }

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-nyfed-recession] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

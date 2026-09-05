/**
 * NY Fed 全球供应链压力指数（GSCPI）——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-nyfed-gscpi
 * npm run data:sync-nyfed-gscpi -- --fixture=.data/nyfed-gscpi-sample.xlsx
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchNyFedGscpiWorkbook } from "../../src/lib/data/scheduler/nyFedGscpi/client";
import { parseGscpiWorkbook } from "../../src/lib/data/scheduler/nyFedGscpi/parseGscpiWorkbook";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { NYFED_GSCPI_INSTRUMENT } from "../../src/lib/data/scheduler/nyFedGscpi/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const wb = await fetchNyFedGscpiWorkbook(fixturePath ? { fixturePath } : undefined);
  const { points, latestObsDate, skippedInvalid } = parseGscpiWorkbook(wb);
  console.log(
    `[sync-nyfed-gscpi] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: NYFED_GSCPI_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-nyfed-gscpi");
  }

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-nyfed-gscpi] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

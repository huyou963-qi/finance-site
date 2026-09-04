/**
 * Shiller CAPE——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-shiller-cape
 * npm run data:sync-shiller-cape -- --fixture=.data/shiller-cape-sample.html
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchShillerCapePage } from "../../src/lib/data/scheduler/shillerCape/client";
import { parseShillerCapePage } from "../../src/lib/data/scheduler/shillerCape/parseCapePage";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { SHILLER_CAPE_INSTRUMENT } from "../../src/lib/data/scheduler/shillerCape/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const html = await fetchShillerCapePage(fixturePath ? { fixturePath } : undefined);
  const { points, latestObsDate, skippedInvalid } = parseShillerCapePage(html);
  console.log(
    `[sync-shiller-cape] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: SHILLER_CAPE_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-shiller-cape");
  }

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-shiller-cape] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

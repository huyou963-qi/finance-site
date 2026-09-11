/**
 * 标普500 市盈率（multpl.com）——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-multpl-sp500-pe
 * npm run data:sync-multpl-sp500-pe -- --fixture=.data/multpl-sp500-pe-sample.html
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchShillerCapePage } from "../../src/lib/data/scheduler/shillerCape/client";
import { parseShillerCapePage } from "../../src/lib/data/scheduler/shillerCape/parseCapePage";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import {
  MULTPL_SP500_PE_INSTRUMENT,
  MULTPL_SP500_PE_PAGE_URL,
} from "../../src/lib/data/scheduler/multplSp500Pe/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const html = await fetchShillerCapePage(
    fixturePath ? { fixturePath } : { url: MULTPL_SP500_PE_PAGE_URL },
  );
  const { points, latestObsDate, skippedInvalid } = parseShillerCapePage(html);
  console.log(
    `[sync-multpl-sp500-pe] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: MULTPL_SP500_PE_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-multpl-sp500-pe");
  }

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-multpl-sp500-pe] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

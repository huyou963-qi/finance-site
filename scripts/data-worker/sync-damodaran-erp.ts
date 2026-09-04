/**
 * Damodaran 隐含股权风险溢价——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-damodaran-erp
 * npm run data:sync-damodaran-erp -- --fixture=.data/damodaran-histimpl-sample.xls
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchDamodaranErpWorkbook } from "../../src/lib/data/scheduler/damodaranErp/client";
import { parseHistImplWorkbook } from "../../src/lib/data/scheduler/damodaranErp/parseHistImpl";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { DAMODARAN_ERP_INSTRUMENT } from "../../src/lib/data/scheduler/damodaranErp/catalog";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const fixturePath = argValue("fixture");
  const wb = await fetchDamodaranErpWorkbook(fixturePath ? { fixturePath } : undefined);
  const { points, latestObsDate, skippedInvalid } = parseHistImplWorkbook(wb);
  console.log(
    `[sync-damodaran-erp] ${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
      `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}`,
  );

  const inst = await prisma.instrument.findUnique({
    where: { code: DAMODARAN_ERP_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-damodaran-erp");
  }

  const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
  console.log(`[sync-damodaran-erp] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

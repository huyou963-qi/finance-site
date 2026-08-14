/**
 * 配置 ISM 服务业 PMI：官网月报为主源，TE 为备份校对。
 *
 * npm run data:seed-ism-svc-te
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { ISM_OFFICIAL_SVC_SERIES } from "../../src/lib/data/scheduler/ismOfficial/catalog";
import {
  upsertIsmOfficialAgencyAndSource,
  wireIsmOfficialSeries,
} from "./ismOfficialSeed";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await upsertIsmOfficialAgencyAndSource(prisma);
  const wired = await wireIsmOfficialSeries(prisma, ISM_OFFICIAL_SVC_SERIES);
  console.info(`[done] 已配置 ${wired}/${ISM_OFFICIAL_SVC_SERIES.length} 条 ISM 服务业（官网主源）`);
  console.info("下一步：npm run data:sync-ism-official && npm run data:sync-calendar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

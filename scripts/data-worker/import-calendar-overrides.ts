/**
 * 将 `.data` 日历覆盖 JSON 导入 PostgreSQL（幂等，不覆盖已有 DB 键）
 *
 * npm run data:import-calendar-overrides
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { importLegacyCalendarOverrideFiles } from "../../src/lib/data/scheduler/calendarMappingStore";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  const result = await importLegacyCalendarOverrideFiles();
  console.info(
    `[import-calendar-overrides] fred=${result.fredImported} package=${result.packageImported}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

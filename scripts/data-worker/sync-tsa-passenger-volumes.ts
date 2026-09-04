/**
 * TSA 安检口旅客通过人数——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-tsa-passenger-volumes（回填 2019 至今全部年度）
 * npm run data:sync-tsa-passenger-volumes -- --fixture=.data/tsa-passenger-volumes-current-sample.html --year=2026
 * npm run data:sync-tsa-passenger-volumes -- --from=2024（只回填 2024 年至今）
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import {
  TSA_PASSENGER_VOLUMES_FIRST_YEAR,
  TSA_PASSENGER_VOLUMES_INSTRUMENT,
} from "../../src/lib/data/scheduler/tsaPassengerVolumes/catalog";
import { fetchTsaPassengerVolumesPage } from "../../src/lib/data/scheduler/tsaPassengerVolumes/client";
import { parseTsaPassengerVolumesPage } from "../../src/lib/data/scheduler/tsaPassengerVolumes/parsePassengerVolumes";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const fixturePath = argValue("fixture");
  const yearArg = argValue("year");
  const fromArg = argValue("from");
  const currentYear = new Date().getUTCFullYear();

  const years = yearArg
    ? [Number(yearArg)]
    : Array.from(
        { length: currentYear - (Number(fromArg) || TSA_PASSENGER_VOLUMES_FIRST_YEAR) + 1 },
        (_, i) => (Number(fromArg) || TSA_PASSENGER_VOLUMES_FIRST_YEAR) + i,
      );

  const inst = await prisma.instrument.findUnique({
    where: { code: TSA_PASSENGER_VOLUMES_INSTRUMENT.code },
  });
  if (!inst) {
    throw new Error("未找到仪器，请先 npm run data:seed-tsa-passenger-volumes");
  }

  let totalUpserted = 0;
  let totalSkipped = 0;

  for (const year of years) {
    const html = await fetchTsaPassengerVolumesPage(year, currentYear, { fixturePath });
    const { points, latestObsDate, skippedInvalid } = parseTsaPassengerVolumesPage(html);
    console.log(
      `[sync-tsa-passenger-volumes] ${year}（${fixturePath ? `fixture=${fixturePath} ` : "live "}` +
        `解析 ${points.length} 点，跳过无效 ${skippedInvalid}，最新 ${latestObsDate?.toISOString().slice(0, 10)}）`,
    );
    const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
    totalUpserted += upserted;
    totalSkipped += skipped;
    console.log(`[sync-tsa-passenger-volumes] ${year} 完成：upserted=${upserted} skipped=${skipped}`);
    if (!fixturePath && year !== years[years.length - 1]) {
      await sleep(1500); // 逐年请求限速，避免连续轰炸源站
    }
  }

  console.log(
    `[sync-tsa-passenger-volumes] 全部完成：totalUpserted=${totalUpserted} totalSkipped=${totalSkipped}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

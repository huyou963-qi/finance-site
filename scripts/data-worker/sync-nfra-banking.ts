/** 金融监管总局银行业统计——全量抓取/回填（支持每个数据集独立 fixture）。 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchNfraBankingWorkbooks } from "../../src/lib/data/scheduler/nfraBanking/client";
import {
  NFRA_BANKING_SERIES,
  type NfraBankingDataset,
} from "../../src/lib/data/scheduler/nfraBanking/catalog";
import { parseNfraBankingWorkbook } from "../../src/lib/data/scheduler/nfraBanking/parseNfraBankingWorkbook";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
}

async function syncDataset(dataset: NfraBankingDataset, fixtureArg: string) {
  const fixture = argValue(fixtureArg);
  const sources = await fetchNfraBankingWorkbooks(dataset, {
    includeHistory: !fixture,
    fixturePaths: fixture ? fixture.split(",").filter(Boolean) : undefined,
  });
  const parsed = sources.map((source) => parseNfraBankingWorkbook(source.workbook, dataset));
  let total = 0;
  for (const row of NFRA_BANKING_SERIES.filter((item) => item.dataset === dataset)) {
    const points = parsed.flatMap((item) => item.pointsBySeries.get(row.seriesKey) ?? []);
    const unique = [...new Map(points.map((point) => [point.obsDate.getTime(), point])).values()].sort(
      (a, b) => a.obsDate.getTime() - b.obsDate.getTime(),
    );
    const instrument = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!instrument) throw new Error(`未找到 ${row.instrumentCode}，请先运行 data:seed-nfra-banking`);
    const result = await upsertMacroObservations(prisma, instrument.id, unique);
    total += result.upserted;
    console.log(
      `  ${row.instrumentCode}: ${unique.length} 点，最新 ${unique.at(-1)?.obsDate.toISOString().slice(0, 10) ?? "无"}`,
    );
  }
  console.log(`[data:sync-nfra-banking] ${dataset} 完成：workbooks=${sources.length}, upserted=${total}`);
}

async function main() {
  await syncDataset("bank_assets_monthly", "fixture-monthly");
  await syncDataset("commercial_bank_main_quarterly", "fixture-quarterly");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

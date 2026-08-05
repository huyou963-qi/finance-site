/** 抓取中国 CPI 官方首发并以国家数据接口全历史回填，幂等写入。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchNbsCpiWorkbook } from "../../src/lib/data/scheduler/nbsCpi/client";
import { NBS_CPI_INSTRUMENT_CODES } from "../../src/lib/data/scheduler/nbsCpi/catalog";
import { fetchNbsCpiHistory, mergeNbsCpiPoints } from "../../src/lib/data/scheduler/nbsCpi/historyClient";
import { parseNbsCpiWorkbook } from "../../src/lib/data/scheduler/nbsCpi/parseWorkbook";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
const fixturePath = process.argv.find((value) => value.startsWith("--fixture="))?.slice("--fixture=".length);
const workbookUrl = process.argv.find((value) => value.startsWith("--workbook-url="))?.slice("--workbook-url=".length);
async function main() {
  const source = await fetchNbsCpiWorkbook(fixturePath ? { fixturePath } : workbookUrl ? { workbookUrl } : undefined);
  const latest = parseNbsCpiWorkbook(source.workbook);
  const pointsByInstrument = fixturePath ? latest.pointsByInstrument : mergeNbsCpiPoints(await fetchNbsCpiHistory(), latest.pointsByInstrument);
  let upserted = 0; let unchanged = 0;
  for (const code of NBS_CPI_INSTRUMENT_CODES) {
    const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    if (!instrument) throw new Error(`未找到仪器 ${code}，请先 npm run data:seed-nbs-cpi`);
    const result = await upsertMacroObservations(prisma, instrument.id, pointsByInstrument.get(code) ?? []);
    upserted += result.upserted; unchanged += result.unchanged;
    console.log(`  ${code} points=${(pointsByInstrument.get(code) ?? []).length} upserted=${result.upserted} unchanged=${result.unchanged}`);
  }
  console.log(`[sync-nbs-cpi] ${source.workbookUrl} · 最新 ${latest.sourceLatestObsDate.toISOString().slice(0, 10)} · upserted=${upserted} unchanged=${unchanged}`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

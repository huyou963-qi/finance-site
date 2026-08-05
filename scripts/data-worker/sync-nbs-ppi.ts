/** 中国 PPI 官方全历史回填；可重复运行，按 observation 唯一键幂等写入。 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchNbsPpiHistory } from "../../src/lib/data/scheduler/nbsPpi/client";
import { NBS_PPI_INSTRUMENT_CODES } from "../../src/lib/data/scheduler/nbsPpi/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const history = await fetchNbsPpiHistory();
  let upserted = 0; let unchanged = 0;
  for (const code of NBS_PPI_INSTRUMENT_CODES) {
    const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    if (!instrument) throw new Error(`未找到仪器 ${code}，请先运行 npm run data:seed-nbs-ppi`);
    const result = await upsertMacroObservations(prisma, instrument.id, history.get(code) ?? []);
    upserted += result.upserted; unchanged += result.unchanged;
    console.log(`  ${code} points=${(history.get(code) ?? []).length} upserted=${result.upserted} unchanged=${result.unchanged}`);
  }
  console.log(`[data:sync-nbs-ppi] 完成：upserted=${upserted} unchanged=${unchanged}`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

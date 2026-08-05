/** 中国 PPI 接入自检。npm run data:verify-nbs-ppi -- --db */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { NBS_PPI_COMPONENTS, NBS_PPI_INSTRUMENT_CODES } from "../../src/lib/data/scheduler/nbsPpi/catalog";
loadEnvConfig(process.cwd());

async function main() {
  if (new Set(NBS_PPI_INSTRUMENT_CODES).size !== NBS_PPI_INSTRUMENT_CODES.length) throw new Error("PPI catalog 存在重复 code");
  if (NBS_PPI_COMPONENTS.length !== 44) throw new Error(`PPI 分项数异常：${NBS_PPI_COMPONENTS.length}`);
  if (!process.argv.includes("--db")) { console.log("[verify-nbs-ppi] catalog 通过：3 个大类 + 41 个工业门类，132 条序列"); return; }
  const prisma = new PrismaClient(); let errors = 0;
  try {
    for (const code of NBS_PPI_INSTRUMENT_CODES) {
      const instrument = await prisma.instrument.findUnique({ where: { code }, include: { dataSubscription: true } });
      if (!instrument) { console.error(`  缺 Instrument ${code}`); errors++; continue; }
      const acquisition = readFetchAcquisition(instrument.metadata); const scrape = (instrument.metadata as Record<string, unknown>)?.scrape as Record<string, unknown> | undefined;
      const count = await prisma.macroObservation.count({ where: { instrumentId: instrument.id } });
      const badDate = await prisma.macroObservation.count({ where: { instrumentId: instrument.id, NOT: { obsDate: { equals: new Date("1900-01-01") } } } });
      if (acquisition?.status !== "known" || scrape?.provider !== "nbs_ppi" || !instrument.dataSubscription?.enabled || instrument.dataSubscription.sourceId !== "nbs-ppi" || count === 0 || badDate === 0) { console.error(`  异常 ${code} observations=${count}`); errors++; }
    }
  } finally { await prisma.$disconnect(); }
  if (errors) throw new Error(`[verify-nbs-ppi] 失败：${errors} 项`);
  console.log("[verify-nbs-ppi] 通过");
}
main().catch((error) => { console.error(error); process.exit(1); });

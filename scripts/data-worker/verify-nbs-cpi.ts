import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { NBS_CPI_COMPONENTS, NBS_CPI_INSTRUMENT_CODES, NBS_CPI_MEASURES, nbsCpiCode } from "../../src/lib/data/scheduler/nbsCpi/catalog";
loadEnvConfig(process.cwd());
async function main() {
  if (new Set(NBS_CPI_INSTRUMENT_CODES).size !== 39) throw new Error("NBS CPI catalog 数量或 code 重复");
  if (!process.argv.includes("--db")) return void console.log("[verify-nbs-cpi] catalog 通过：13 分项 × 指数/同比/环比（加 --db 检查数据库）");
  const prisma = new PrismaClient(); let errors = 0;
  try { for (const component of NBS_CPI_COMPONENTS) for (const measure of NBS_CPI_MEASURES) {
    const code = nbsCpiCode(component.key, measure.key);
    const instrument = await prisma.instrument.findUnique({ where: { code }, include: { dataSubscription: true } });
    if (!instrument) { console.error(`  ✗ 缺 Instrument ${code}`); errors++; continue; }
    const metadata = (instrument.metadata ?? {}) as Record<string, unknown>; const scrape = metadata.scrape as Record<string, unknown> | undefined;
    const count = await prisma.macroObservation.count({ where: { instrumentId: instrument.id } });
    const dates = await prisma.macroObservation.findMany({ where: { instrumentId: instrument.id }, select: { obsDate: true } });
    const nonMonthStart = dates.filter((row) => row.obsDate.getUTCDate() !== 1).length;
    const latest = await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "desc" } });
    if (readFetchAcquisition(instrument.metadata)?.status !== "known" || scrape?.provider !== "nbs_cpi" || !instrument.dataSubscription?.enabled || instrument.dataSubscription.sourceId !== "nbs-cpi" || count < 12 || !latest || latest.obsDate.getUTCDate() !== 1 || !Number.isFinite(latest.value) || nonMonthStart > 0) { console.error(`  ✗ ${code} metadata/subscription/history 异常`); errors++; } else console.log(`  ✓ ${code} observations=${count}`);
  }} finally { await prisma.$disconnect(); }
  if (errors) throw new Error(`[verify-nbs-cpi] 失败：${errors} 项`);
  console.log("[verify-nbs-cpi] 通过");
}
main().catch((error) => { console.error(error); process.exit(1); });

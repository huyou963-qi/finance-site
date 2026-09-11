import { loadEnvConfig } from "@next/env";
import { PrismaClient, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { PHASE5_DATA_SOURCES } from "../../src/lib/data/scheduler/phase5SeedCatalog";
import { JP_ESTAT_LABOR_SERIES, JP_ESTAT_LABOR_SOURCE_ID, buildJpEStatLaborMetadata } from "../../src/lib/data/scheduler/eStat/laborCatalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const source = PHASE5_DATA_SOURCES[JP_ESTAT_LABOR_SOURCE_ID];
  await prisma.dataSource.upsert({ where: { id: source.id }, create: source, update: { name: source.name, adapterKind: source.adapterKind, baseUrl: source.baseUrl, termsUrl: source.termsUrl, rateLimit: source.rateLimit, metadata: source.metadata } });
  for (const s of JP_ESTAT_LABOR_SERIES) {
    const old = await prisma.instrument.findUnique({ where: { code: s.instrumentCode } });
    const previous = old?.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {};
    const fields = { name: `日本：${s.label}`, unit: s.unit, freqLabel: "月", metadata: { ...previous, ...buildJpEStatLaborMetadata(s) }, externalRefs: { sourceId: source.id, statsDataId: s.eStat.statsDataId, catalogKey: `mds:${s.instrumentCode}` } };
    const inst = await prisma.instrument.upsert({ where: { code: s.instrumentCode }, create: { code: s.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const sub = { sourceId: source.id, sourceSeriesKey: s.eStat.statsDataId, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: { type: "probe_interval", intervalHours: 24 }, enabled: true, priority: 8 };
    await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...sub, nextRunAt: new Date() }, update: sub });
    console.log(`seed ${s.instrumentCode}`);
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Labor seed failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

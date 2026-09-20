import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { JP_CYCLE_LABOR_SERIES, JP_CYCLE_LABOR_SOURCE_ID, buildJpCycleLaborMetadata } from "../../src/lib/data/scheduler/jpCycleLabor/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  await prisma.dataSource.upsert({ where: { id: JP_CYCLE_LABOR_SOURCE_ID }, create: { id: JP_CYCLE_LABOR_SOURCE_ID, name: "日本官方景气与劳动力长期时序", adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: "https://www.e-stat.go.jp/", rateLimit: { requestsPerMinute: 20 }, metadata: { countryCode: "JP", official: true } }, update: { name: "日本官方景气与劳动力长期时序", adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: "https://www.e-stat.go.jp/", rateLimit: { requestsPerMinute: 20 }, metadata: { countryCode: "JP", official: true } } });
  for (const series of JP_CYCLE_LABOR_SERIES) {
    const old = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = old?.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {};
    const fields = { name: `日本：${series.label}`, unit: series.unit, freqLabel: "月", metadata: { ...previous, ...buildJpCycleLaborMetadata(series) }, externalRefs: { sourceId: JP_CYCLE_LABOR_SOURCE_ID, catalogKey: `mds:${series.instrumentCode}` } };
    const instrument = await prisma.instrument.upsert({ where: { code: series.instrumentCode }, create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, sourceId: JP_CYCLE_LABOR_SOURCE_ID, sourceSeriesKey: series.instrumentCode, fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity.MONTHLY, releaseRule: { type: "probe_interval", intervalHours: 24 }, enabled: true, priority: 8, nextRunAt: new Date() }, update: { sourceId: JP_CYCLE_LABOR_SOURCE_ID, sourceSeriesKey: series.instrumentCode, fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity.MONTHLY, releaseRule: { type: "probe_interval", intervalHours: 24 }, enabled: true, priority: 8 } });
    console.log("seed", series.instrumentCode);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Japan cycle/labor seed failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { PHASE5_DATA_SOURCES } from "../../src/lib/data/scheduler/phase5SeedCatalog";
import {
  buildJpHousingPopulationMetadata,
  buildJpMlitPropertyPriceMetadata,
  JP_HOUSING_POPULATION_ESTAT_SERIES,
  JP_MLIT_PROPERTY_PRICE_SERIES,
} from "../../src/lib/data/scheduler/jpHousingPopulation/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function upsertSeries(input: { code: string; name: string; unit: string; freqLabel: string; metadata: Record<string, unknown>; sourceId: string; sourceSeriesKey: string; granularity: DataGranularity; fetchMethod: DataFetchMethod }) {
  const previous = await prisma.instrument.findUnique({ where: { code: input.code }, select: { metadata: true } });
  const oldMetadata = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {};
  const instrument = await prisma.instrument.upsert({
    where: { code: input.code },
    create: { code: input.code, kind: InstrumentKind.MACRO_SERIES, name: `日本：${input.name}`, unit: input.unit, freqLabel: input.freqLabel, metadata: { ...oldMetadata, ...input.metadata }, externalRefs: { sourceId: input.sourceId, catalogKey: `mds:${input.code}` } },
    update: { name: `日本：${input.name}`, unit: input.unit, freqLabel: input.freqLabel, metadata: { ...oldMetadata, ...input.metadata }, externalRefs: { sourceId: input.sourceId, catalogKey: `mds:${input.code}` } },
  });
  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: { instrumentId: instrument.id, sourceId: input.sourceId, sourceSeriesKey: input.sourceSeriesKey, fetchMethod: input.fetchMethod, granularity: input.granularity, releaseRule: { type: "probe_interval", intervalHours: 24 }, nextRunAt: new Date(), enabled: true, priority: 8 },
    update: { sourceId: input.sourceId, sourceSeriesKey: input.sourceSeriesKey, fetchMethod: input.fetchMethod, granularity: input.granularity, releaseRule: { type: "probe_interval", intervalHours: 24 }, enabled: true },
  });
  console.log(`seed ${input.code}`);
}

async function main() {
  const source = PHASE5_DATA_SOURCES["estat-jp"];
  await prisma.dataSource.upsert({ where: { id: source.id }, create: source, update: { name: source.name, adapterKind: source.adapterKind, baseUrl: source.baseUrl, termsUrl: source.termsUrl, rateLimit: source.rateLimit, metadata: source.metadata } });
  await prisma.dataSource.upsert({
    where: { id: "mlit-jp" },
    create: { id: "mlit-jp", agencyId: null, name: "日本国土交通省", adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: "https://www.mlit.go.jp/", termsUrl: "https://www.mlit.go.jp/link.html", rateLimit: { minIntervalMs: 2_000 }, metadata: { official: true } },
    update: { name: "日本国土交通省", adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: "https://www.mlit.go.jp/", termsUrl: "https://www.mlit.go.jp/link.html", rateLimit: { minIntervalMs: 2_000 }, metadata: { official: true } },
  });
  for (const series of JP_HOUSING_POPULATION_ESTAT_SERIES) {
    await upsertSeries({ code: series.instrumentCode, name: series.label, unit: series.unit, freqLabel: series.freqLabel, metadata: buildJpHousingPopulationMetadata(series), sourceId: "estat-jp", sourceSeriesKey: series.eStat.statsDataId, granularity: series.eStat.frequency === "A" ? DataGranularity.ANNUAL : DataGranularity.MONTHLY, fetchMethod: DataFetchMethod.API });
  }
  const ppi = JP_MLIT_PROPERTY_PRICE_SERIES;
  await upsertSeries({ code: ppi.instrumentCode, name: ppi.label, unit: ppi.unit, freqLabel: ppi.freqLabel, metadata: buildJpMlitPropertyPriceMetadata(), sourceId: "mlit-jp", sourceSeriesKey: ppi.officialUrl, granularity: DataGranularity.MONTHLY, fetchMethod: DataFetchMethod.BULK_DOWNLOAD });
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

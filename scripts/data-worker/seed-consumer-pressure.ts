import { loadEnvConfig } from "@next/env";
import { PrismaClient, InstrumentKind, SourceAdapterKind } from "@prisma/client";
import { CONSUMER_PRESSURE_FRED, NYFED_HHDC_SERIES, NYFED_HHDC_PAGE, NYFED_HHDC_PROVIDER } from "../../src/lib/data/scheduler/consumerPressure/catalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { sanitizeCatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
import { placeConsumerPressureKeys } from "../../src/lib/data/scheduler/consumerPressure/layout";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "us-nyfed" }, create: { id: "us-nyfed", countryCode: "US", nameZh: "纽约联储", nameEn: "Federal Reserve Bank of New York", websiteUrl: "https://www.newyorkfed.org/" }, update: {} });
  await prisma.dataSource.upsert({ where: { id: "nyfed-hhdc" }, create: { id: "nyfed-hhdc", agencyId: "us-nyfed", name: "纽约联储家庭债务与信贷", adapterKind: SourceAdapterKind.REST_API, baseUrl: NYFED_HHDC_PAGE, termsUrl: "https://www.newyorkfed.org/disclaimer", rateLimit: { minIntervalMs: 500 } }, update: {} });
  const rows = [
    ...CONSUMER_PRESSURE_FRED.map(row => ({ code: `sched_fred_${row.fredId}`, name: row.name, unit: row.unit, fredId: row.fredId, subgroup: row.subgroup, sourceId: "fred", source: row.fredId.startsWith("BOGZ") ? "Fed/FRED" : "Philadelphia Fed/FRED", officialUrl: `https://fred.stlouisfed.org/series/${row.fredId}` })),
    ...NYFED_HHDC_SERIES.map(row => ({ code: row.code, name: row.name, unit: row.unit, fredId: null, subgroup: "居民消费信贷", sourceId: "nyfed-hhdc", source: "NY Fed", officialUrl: NYFED_HHDC_PAGE })),
  ];
  for (const row of rows) {
    const previous = await prisma.instrument.findUnique({ where: { code: row.code } });
    const oldMetadata = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {};
    const metadata = mergeFetchAcquisition({ ...oldMetadata, countryCode: "US", countryNameZh: "美国", displayName: row.name, catalogCategory: "金融条件与银行", catalogSubgroup: row.subgroup, source: row.source, sourceUrl: row.officialUrl, officialUrl: row.officialUrl, freqLabel: "季", unit: row.unit, catalogKey: row.fredId ? `fred:${row.fredId}` : `mds:${row.code}`, bootstrapOnly: false,
      ...(row.fredId === "BOGZ1FL193034005Q" ? { observationStartDate: "1945-10-01" } : {}),
      ...(row.fredId ? {} : { scrape: { provider: NYFED_HHDC_PROVIDER, url: NYFED_HHDC_PAGE, script: "scripts/data-worker/sync-consumer-pressure.ts" } }),
    }, { status: "known", probedAt: new Date().toISOString(), method: row.fredId ? "fred_api" : "nyfed_hhdc_scrape", methodLabel: row.source, fetchUrl: row.officialUrl, officialUrl: row.officialUrl, message: row.fredId ? "官方基础序列，原生季度频率" : "季度报告公开工作簿，自动发现最新文件并完整回读历史" });
    const data = { name: row.name, unit: row.unit, freqLabel: "季", fredSeriesId: row.fredId, metadata: metadata as object };
    const instrument = await prisma.instrument.upsert({ where: { code: row.code }, create: { code: row.code, kind: InstrumentKind.MACRO_SERIES, ...data, externalRefs: { catalogKey: row.fredId ? `fred:${row.fredId}` : `mds:${row.code}`, sourceId: row.sourceId } }, update: data });
    const current = await prisma.dataSubscription.findUnique({ where: { instrumentId: instrument.id } });
    // Stage DB records before deploying a newly added adapter; data:apply enables them after deployment.
    const enabled = row.sourceId !== "nyfed-hhdc" || !process.argv.includes("--stage-nyfed");
    const schedule = { sourceId: row.sourceId, sourceSeriesKey: row.fredId ?? row.code, fetchMethod: "API" as const, granularity: "QUARTERLY" as const, releaseRule: { type: "probe_interval", intervalHours: 168 }, revisionLookback: 1200, enabled };
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...schedule, nextRunAt: new Date(), priority: 8 }, update: { ...schedule, ...(current?.nextRunAt ? {} : { nextRunAt: new Date() }) } });
    console.log(`[consumer-pressure] ${row.code} ${previous ? "exists" : "created"}`);
  }
  const saved = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  if (saved) {
    const layout = sanitizeCatalogLayoutDocument(saved.layout);
    if (!layout) throw new Error("Invalid saved catalog layout");
    const updated = await prisma.macroCatalogLayout.updateMany({
      where: { id: saved.id, updatedAt: saved.updatedAt },
      data: { layout: placeConsumerPressureKeys(layout) as object, updatedBy: "consumer-pressure-seed" },
    });
    if (updated.count !== 1) throw new Error("Catalog changed concurrently; rerun seed");
    console.log("[consumer-pressure] catalog placed in two financial subgroups");
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

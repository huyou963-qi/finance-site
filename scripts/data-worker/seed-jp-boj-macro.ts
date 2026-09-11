import { loadEnvConfig } from "@next/env";
import { PrismaClient, SourceAdapterKind, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { BOJ_SERIES, BOJ_API_BASE, BOJ_SOURCE_ID, BOJ_TERMS_URL } from "../../src/lib/data/scheduler/boj/catalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "jp-boj" }, create: { id: "jp-boj", countryCode: "JP", nameZh: "日本银行", nameEn: "Bank of Japan", websiteUrl: "https://www.boj.or.jp/" }, update: {} });
  await prisma.dataSource.upsert({ where: { id: BOJ_SOURCE_ID }, create: { id: BOJ_SOURCE_ID, agencyId: "jp-boj", name: "BOJ Time-Series API", adapterKind: SourceAdapterKind.REST_API, baseUrl: BOJ_API_BASE, termsUrl: BOJ_TERMS_URL, rateLimit: { minIntervalMs: 2000 } }, update: { termsUrl: BOJ_TERMS_URL } });
  for (const row of BOJ_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const prev = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const metadata = mergeFetchAcquisition({ ...prev, sourceTag: "jp-boj-macro", source: "日本银行（BOJ）", provider: "boj-time-series", countryCode: "JP", countryNameZh: "日本", displayName: row.displayName, catalogKey: `mds:${row.instrumentCode}`, catalogCategory: row.category, catalogSubgroup: row.subgroup, sourceUrl: BOJ_API_BASE, officialUrl: "https://www.boj.or.jp/en/statistics/", sourceSeriesCode: row.seriesCode, sourceDatabase: row.db, sourceUnit: row.sourceUnit, sourceName: row.sourceName, sourceNotes: row.notes, freqLabel: row.freqLabel, unit: row.unit, bootstrapOnly: false, sourceUpdateNote: "官方 API 全历史探测，自动覆盖修订；月频72小时、季频168小时。", dateConvention: "period_start", revisionPolicy: "latest-revised; snapshots captured at retrieval time; not historical PIT", apiServiceReleaseNotificationRequired: true }, { status: "known", probedAt: new Date().toISOString(), method: "rest_api", methodLabel: "BOJ Time-Series API", fetchUrl: `${BOJ_API_BASE}/getDataCode?format=json&lang=en&db=${row.db}&code=${encodeURIComponent(row.seriesCode)}`, officialUrl: "https://www.boj.or.jp/en/statistics/", message: "官方元数据与API已核实" });
    const data = { name: row.displayName, freqLabel: row.freqLabel, unit: row.unit, metadata: metadata as object };
    const inst = await prisma.instrument.upsert({ where: { code: row.instrumentCode }, create: { code: row.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...data, externalRefs: { catalogKey: `mds:${row.instrumentCode}`, sourceId: BOJ_SOURCE_ID, bojSeriesCode: row.seriesCode, bojDatabase: row.db } }, update: data });
    const releaseRule = { type: "probe_interval", intervalHours: row.frequency === "QUARTERLY" ? 168 : 72 };
    const sub = { sourceId: BOJ_SOURCE_ID, sourceSeriesKey: `${row.db}:${row.seriesCode}`, fetchMethod: DataFetchMethod.API, granularity: row.frequency === "QUARTERLY" ? DataGranularity.QUARTERLY : DataGranularity.MONTHLY, releaseRule, enabled: true, priority: 8 };
    await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...sub, nextRunAt: new Date() }, update: sub });
    console.log(`seed ${row.instrumentCode} ${row.freqLabel} ${row.unit}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

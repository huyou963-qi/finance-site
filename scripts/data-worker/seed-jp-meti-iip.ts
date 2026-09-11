import { loadEnvConfig } from "@next/env";
import { PrismaClient, SourceAdapterKind, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { JP_METI_IIP_PAGE, JP_METI_IIP_URL, JP_METI_IIP_PROVIDER, JP_METI_IIP_SERIES, JP_METI_IIP_SOURCE_ID } from "../../src/lib/data/scheduler/jpMetiIip/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "jp-meti" }, create: { id: "jp-meti", countryCode: "JP", nameZh: "日本经济产业省", nameEn: "Ministry of Economy, Trade and Industry", websiteUrl: "https://www.meti.go.jp/" }, update: { nameZh: "日本经济产业省" } });
  const source = { agencyId: "jp-meti", name: "日本 METI 工业生产（e-Stat 官方文件）", adapterKind: SourceAdapterKind.REST_API, baseUrl: JP_METI_IIP_PAGE, termsUrl: "https://www.e-stat.go.jp/terms-of-use", rateLimit: { minIntervalMs: 5000, requestsPerMinute: 6 } };
  await prisma.dataSource.upsert({ where: { id: JP_METI_IIP_SOURCE_ID }, create: { id: JP_METI_IIP_SOURCE_ID, ...source }, update: source });
  for (const s of JP_METI_IIP_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: s.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const metadata = { ...previous, countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${s.instrumentCode}`, catalogCategory: "国民经济", displayName: s.label, bootstrapOnly: false, source: "METI / e-Stat", officialUrl: JP_METI_IIP_PAGE, sourceUrl: JP_METI_IIP_PAGE, unit: "指数（2020=100）", freqLabel: "月", baseYear: 2020, seasonalAdjustment: "SA", sourceIndustryCode: "1000000000", sourceIndustryName: "鉱工業", sourceUpdateNote: "月度初值及修订值；每次重读2018年以来完整历史，统一writer记录实际抓取时点的修订；原文件保留p初值标记。", scrape: { provider: JP_METI_IIP_PROVIDER, url: JP_METI_IIP_URL, component: s.sheet, script: "scripts/data-worker/sync-jp-meti-iip.ts" }, fetchAcquisition: { status: "known", probedAt: new Date().toISOString(), method: "jp_meti_iip_official_excel", methodLabel: "scripts/data-worker/sync-jp-meti-iip.ts", fetchUrl: JP_METI_IIP_URL, officialUrl: JP_METI_IIP_PAGE }, attribution: "Source: METI Indices of Industrial Production, distributed via e-Stat; Chinese labels translated by finance-site." };
    const fields = { name: `日本：${s.label}`, freqLabel: "月", unit: "指数（2020=100）", metadata, externalRefs: { catalogKey: `mds:${s.instrumentCode}`, sourceId: JP_METI_IIP_SOURCE_ID, agencyId: "jp-meti", estatStatInfId: "000040172363" } };
    const inst = await prisma.instrument.upsert({ where: { code: s.instrumentCode }, create: { code: s.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const rule = { type: "probe_interval", intervalHours: 72 };
    const sub = { sourceId: JP_METI_IIP_SOURCE_ID, sourceSeriesKey: s.instrumentCode, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: rule as object, enabled: true, priority: 8 };
    await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...sub, nextRunAt: new Date() }, update: sub });
    console.log(`seed ${s.instrumentCode}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

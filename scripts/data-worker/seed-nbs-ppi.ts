/** 中国 PPI（总项、生产/生活资料、41 个工业门类）订阅种子。 */
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { fetchNbsPpiCurrentCatalog } from "../../src/lib/data/scheduler/nbsPpi/client";
import { NBS_PPI_COMPONENTS, NBS_PPI_INDEX_URL, NBS_PPI_MEASURES, NBS_PPI_SOURCE, NBS_PPI_SYNC_SCRIPT, nbsPpiCode } from "../../src/lib/data/scheduler/nbsPpi/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-nbs" }, create: { id: "cn-nbs", countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" }, update: { countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: NBS_PPI_SOURCE.id }, create: { id: NBS_PPI_SOURCE.id, agencyId: NBS_PPI_SOURCE.agencyId, name: NBS_PPI_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_PPI_SOURCE.baseUrl, termsUrl: NBS_PPI_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } }, update: { agencyId: NBS_PPI_SOURCE.agencyId, name: NBS_PPI_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_PPI_SOURCE.baseUrl, termsUrl: NBS_PPI_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } } });
  const sources = await fetchNbsPpiCurrentCatalog();
  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  for (const component of NBS_PPI_COMPONENTS) for (const measure of NBS_PPI_MEASURES) {
    const code = nbsPpiCode(component.key, measure.key);
    const sourceMeasure = measure.key === "mom" ? "mom" : "index";
    const series = sources.get(`${component.key}:${sourceMeasure}`);
    if (!series) throw new Error(`PPI 当前目录缺少 ${component.key}:${sourceMeasure}`);
    const previous = await prisma.instrument.findUnique({ where: { code } });
    const old = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata as Record<string, unknown> : {};
    const metadata = mergeFetchAcquisition({ ...old, sourceTag: "nbs-ppi-official-data", bootstrapOnly: false, source: "国家统计局", providerNote: "National Bureau of Statistics of China", sourceUrl: NBS_PPI_INDEX_URL, officialUrl: NBS_PPI_INDEX_URL, countryCode: "CN", countryNameZh: "中国", displayName: `PPI：${component.displayName}${measure.label}`, catalogCategory: "价格指数", freqLabel: "月", unit: measure.unit, sourceUpdateNote: "国家统计局国家数据公开 UUID 接口；指数取上年同月=100，同比为指数减100，环比取上月=100并减100。", scrape: { provider: "nbs_ppi", cid: series.cid, indicatorId: series.indicatorId, sourceMeasure: series.sourceMeasure, component: component.key, componentGroup: component.group, measure: measure.key, script: NBS_PPI_SYNC_SCRIPT } }, { status: "known", probedAt, method: "nbs_ppi_official_nbs_data", methodLabel: NBS_PPI_SYNC_SCRIPT, fetchUrl: NBS_PPI_INDEX_URL, officialUrl: NBS_PPI_INDEX_URL, message: "国家统计局国家数据公开接口，全历史按基期分段拼接。" });
    const instrument = await prisma.instrument.upsert({ where: { code }, create: { code, kind: InstrumentKind.MACRO_SERIES, name: `中国：PPI：${component.displayName}${measure.label}`, shortName: `PPI：${component.displayName}${measure.label}`, description: `国家统计局工业生产者出厂价格：${component.displayName}${measure.label}`, freqLabel: "月", unit: measure.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${code}`, agencyId: NBS_PPI_SOURCE.agencyId, sourceId: NBS_PPI_SOURCE.id } }, update: { name: `中国：PPI：${component.displayName}${measure.label}`, shortName: `PPI：${component.displayName}${measure.label}`, description: `国家统计局工业生产者出厂价格：${component.displayName}${measure.label}`, freqLabel: "月", unit: measure.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, sourceId: NBS_PPI_SOURCE.id, sourceSeriesKey: `${component.key}:${measure.key}`, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 41 }, update: { sourceId: NBS_PPI_SOURCE.id, sourceSeriesKey: `${component.key}:${measure.key}`, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 41 } });
  }
  console.log(`[data:seed-nbs-ppi] 完成：${NBS_PPI_COMPONENTS.length * NBS_PPI_MEASURES.length} 条订阅；下一步 npm run data:sync-nbs-ppi && npm run data:sync-calendar`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

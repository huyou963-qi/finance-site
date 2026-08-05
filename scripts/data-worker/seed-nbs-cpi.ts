/** 中国 CPI（13 个总项/分项 × 指数、同比、环比）订阅种子。 */
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { NBS_CPI_COMPONENTS, NBS_CPI_INDEX_URL, NBS_CPI_MEASURES, NBS_CPI_SOURCE, NBS_CPI_SYNC_SCRIPT, nbsCpiCode } from "../../src/lib/data/scheduler/nbsCpi/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-nbs" }, create: { id: "cn-nbs", countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" }, update: { countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: NBS_CPI_SOURCE.id }, create: { id: NBS_CPI_SOURCE.id, agencyId: NBS_CPI_SOURCE.agencyId, name: NBS_CPI_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_CPI_SOURCE.baseUrl, termsUrl: NBS_CPI_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } }, update: { agencyId: NBS_CPI_SOURCE.agencyId, name: NBS_CPI_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_CPI_SOURCE.baseUrl, termsUrl: NBS_CPI_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } } });
  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  for (const component of NBS_CPI_COMPONENTS) for (const measure of NBS_CPI_MEASURES) {
    const code = nbsCpiCode(component.key, measure.key);
    const previous = await prisma.instrument.findUnique({ where: { code } });
    const old = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata as Record<string, unknown> : {};
    const metadata = mergeFetchAcquisition({ ...old, sourceTag: "nbs-cpi-official-xlsx", bootstrapOnly: false, source: "国家统计局", providerNote: "National Bureau of Statistics of China", sourceUrl: NBS_CPI_INDEX_URL, officialUrl: NBS_CPI_INDEX_URL, countryCode: "CN", countryNameZh: "中国", displayName: `CPI：${component.displayName}${measure.label}`, catalogCategory: "价格指数", freqLabel: "月", unit: measure.unit, sourceUpdateNote: "国家统计局 CPI 月报 Excel 首发；国家数据 UUID 接口按基期分片回填历史", scrape: { provider: "nbs_cpi", indexUrl: NBS_CPI_INDEX_URL, component: component.key, measure: measure.key, script: NBS_CPI_SYNC_SCRIPT } }, { status: "known", probedAt, method: "nbs_cpi_official_xlsx_and_nbs_data", methodLabel: NBS_CPI_SYNC_SCRIPT, fetchUrl: NBS_CPI_INDEX_URL, officialUrl: NBS_CPI_INDEX_URL, message: "国家统计局发布页相关数据表首发 + 国家数据公开 UUID 接口全历史" });
    const instrument = await prisma.instrument.upsert({ where: { code }, create: { code, kind: InstrumentKind.MACRO_SERIES, name: `中国：CPI：${component.displayName}${measure.label}`, shortName: `CPI：${component.displayName}${measure.label}`, description: `国家统计局居民消费价格：${component.displayName}${measure.label}`, freqLabel: "月", unit: measure.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${code}`, agencyId: NBS_CPI_SOURCE.agencyId, sourceId: NBS_CPI_SOURCE.id } }, update: { shortName: `CPI：${component.displayName}${measure.label}`, description: `国家统计局居民消费价格：${component.displayName}${measure.label}`, freqLabel: "月", unit: measure.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, sourceId: NBS_CPI_SOURCE.id, sourceSeriesKey: `${component.key}:${measure.key}`, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 41 }, update: { sourceId: NBS_CPI_SOURCE.id, sourceSeriesKey: `${component.key}:${measure.key}`, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 41 } });
    console.log(`  ✓ ${code}`);
  }
  console.log("[data:seed-nbs-cpi] 完成：39 条订阅；下一步 npm run data:sync-nbs-cpi && npm run data:sync-calendar");
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

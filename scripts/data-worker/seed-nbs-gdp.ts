/** 国家统计局 GDP：季度生产法、总项环比、年度生产法与支出法。 */
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { NBS_GDP_DATA_URL, NBS_GDP_RELEASE_URL, NBS_GDP_SERIES, NBS_GDP_SOURCE, NBS_GDP_SYNC_SCRIPT, type GdpMeasure } from "../../src/lib/data/scheduler/nbsGdp/catalog";

loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
const measureLabels: Record<GdpMeasure, string> = { nominal: "名义值", nominal_cumulative: "名义累计值", real: "不变价值", real_cumulative: "不变价累计值", real_yoy: "实际同比", real_cumulative_yoy: "实际累计同比", mom: "实际环比", contribution: "增长贡献率", contribution_cumulative: "累计增长贡献率" };
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-nbs" }, create: { id: "cn-nbs", countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" }, update: { countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: NBS_GDP_SOURCE.id }, create: { ...NBS_GDP_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } }, update: { agencyId: "cn-nbs", name: NBS_GDP_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_GDP_SOURCE.baseUrl, termsUrl: NBS_GDP_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 6, minIntervalMs: 1000 } } });
  const probedAt = new Date().toISOString();
  for (const item of NBS_GDP_SERIES) {
    const granularity = item.frequency === "quarterly" ? DataGranularity.QUARTERLY : DataGranularity.ANNUAL;
    const rule = defaultEconomicCalendarRule(granularity); const nextRunAt = computeNextRunAt(rule, new Date());
    const previous = await prisma.instrument.findUnique({ where: { code: item.code } }); const old = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata as Record<string, unknown> : {};
    const sourceUpdateNote = item.measure === "mom" ? "国家统计局仅公开国内生产总值总项经季节调整环比，不公开各生产法或支出法分项环比；不创建推算值。" : item.component.group === "expenditure" && item.frequency === "quarterly" ? "国家统计局季度库公开三大需求对 GDP 增长贡献率；支出法金额分项按年度公开。" : "国家统计局国家数据公开接口；不变价同比由官方上年同期=100指数减 100 得到。";
    const scrape = { provider: "nbs_gdp", cid: item.cid, indicatorId: item.indicatorId, frequency: item.frequency, transform: item.transform, component: item.component.key, componentGroup: item.component.group, measure: item.measure, script: NBS_GDP_SYNC_SCRIPT };
    const metadata = mergeFetchAcquisition({ ...old, sourceTag: "nbs-gdp-official-data", bootstrapOnly: false, source: "国家统计局", providerNote: "National Bureau of Statistics of China", sourceUrl: NBS_GDP_DATA_URL, officialUrl: NBS_GDP_RELEASE_URL, countryCode: "CN", countryNameZh: "中国", displayName: `GDP：${item.component.name}${measureLabels[item.measure]}`, catalogCategory: "国民经济核算", freqLabel: item.frequency === "quarterly" ? "季" : "年", unit: item.unit, sourceUpdateNote, scrape }, { status: "known", probedAt, method: "nbs_gdp_official_data_api", methodLabel: NBS_GDP_SYNC_SCRIPT, fetchUrl: NBS_GDP_DATA_URL, officialUrl: NBS_GDP_RELEASE_URL, message: "国家数据季度/年度 GDP UUID 接口；季度发布稿补充口径说明。" });
    const name = `中国：GDP：${item.frequency === "quarterly" ? "季度" : "年度"}${item.component.name}${measureLabels[item.measure]}`;
    const instrument = await prisma.instrument.upsert({ where: { code: item.code }, create: { code: item.code, kind: InstrumentKind.MACRO_SERIES, name, shortName: `GDP：${item.component.name}${measureLabels[item.measure]}`, description: `国家统计局${item.frequency === "quarterly" ? "季度" : "年度"}${item.component.name}${measureLabels[item.measure]}`, freqLabel: item.frequency === "quarterly" ? "季" : "年", unit: item.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${item.code}`, agencyId: "cn-nbs", sourceId: NBS_GDP_SOURCE.id } }, update: { name, shortName: `GDP：${item.component.name}${measureLabels[item.measure]}`, description: `国家统计局${item.frequency === "quarterly" ? "季度" : "年度"}${item.component.name}${measureLabels[item.measure]}`, freqLabel: item.frequency === "quarterly" ? "季" : "年", unit: item.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, sourceId: NBS_GDP_SOURCE.id, sourceSeriesKey: `${item.frequency}:${item.component.key}:${item.measure}`, fetchMethod: DataFetchMethod.API, granularity, releaseRule: rule as object, nextRunAt, enabled: true, priority: 40 }, update: { sourceId: NBS_GDP_SOURCE.id, sourceSeriesKey: `${item.frequency}:${item.component.key}:${item.measure}`, fetchMethod: DataFetchMethod.API, granularity, releaseRule: rule as object, nextRunAt, enabled: true, priority: 40 } });
  }
  console.log(`[data:seed-nbs-gdp] 完成：${NBS_GDP_SERIES.length} 条官方 GDP 订阅`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { NBS_REAL_ESTATE_INDEX_URL, NBS_REAL_ESTATE_SOURCE, NBS_REAL_ESTATE_SOURCE_NOTE, NBS_REAL_ESTATE_SYNC_SCRIPT } from "../../src/lib/data/scheduler/nbsRealEstate/catalog";
import { fetchNbsRealEstateHistory } from "../../src/lib/data/scheduler/nbsRealEstate/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-nbs" }, create: { id: "cn-nbs", countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" }, update: { countryCode: "CN", nameZh: "国家统计局", nameEn: "National Bureau of Statistics of China", websiteUrl: "https://www.stats.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: NBS_REAL_ESTATE_SOURCE.id }, create: { ...NBS_REAL_ESTATE_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { requestsPerMinute: 12, minIntervalMs: 5_000 } }, update: { agencyId: "cn-nbs", name: NBS_REAL_ESTATE_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: NBS_REAL_ESTATE_SOURCE.baseUrl, termsUrl: NBS_REAL_ESTATE_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 12, minIntervalMs: 5_000 } } });
  console.log("[data:seed-nbs-realestate] 正在扫描国家统计局公开发布归档并建立指标定义…");
  const history = await fetchNbsRealEstateHistory({ historical: true });
  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  let upserted = 0;
  for (const series of history.values()) {
    const prior = await prisma.instrument.findUnique({ where: { code: series.code }, select: { metadata: true } });
    const metadata = mergeFetchAcquisition({ ...(prior?.metadata as Record<string, unknown> ?? {}), sourceTag: "nbs-realestate-official-release", bootstrapOnly: false, source: "国家统计局", officialUrl: NBS_REAL_ESTATE_INDEX_URL, sourceUrl: NBS_REAL_ESTATE_INDEX_URL, countryCode: "CN", countryNameZh: "中国", displayName: series.label, catalogCategory: series.category, freqLabel: "月", unit: series.unit, sourceUpdateNote: NBS_REAL_ESTATE_SOURCE_NOTE, scrape: { provider: "nbs_realestate", key: series.key, script: NBS_REAL_ESTATE_SYNC_SCRIPT } }, { status: "known", probedAt, method: "nbs_public_release_xlsx_and_html_tables", methodLabel: NBS_REAL_ESTATE_SYNC_SCRIPT, fetchUrl: NBS_REAL_ESTATE_INDEX_URL, officialUrl: NBS_REAL_ESTATE_INDEX_URL, message: "国家统计局公开房地产月报的相关数据表 Excel，及 70 城房价公开 HTML 表；历史从公开发布归档回填" });
    const item = await prisma.instrument.upsert({ where: { code: series.code }, create: { code: series.code, kind: InstrumentKind.MACRO_SERIES, name: `中国：${series.label}`, shortName: series.label, description: `国家统计局${series.label}`, freqLabel: "月", unit: series.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${series.code}`, agencyId: "cn-nbs", sourceId: NBS_REAL_ESTATE_SOURCE.id } }, update: { name: `中国：${series.label}`, shortName: series.label, description: `国家统计局${series.label}`, freqLabel: "月", unit: series.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: item.id }, create: { instrumentId: item.id, sourceId: NBS_REAL_ESTATE_SOURCE.id, sourceSeriesKey: series.key, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 42 }, update: { sourceId: NBS_REAL_ESTATE_SOURCE.id, sourceSeriesKey: series.key, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 42 } });
    upserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted;
  }
  console.log(`[data:seed-nbs-realestate] 完成：${history.size} 条订阅，历史新增或修订=${upserted}；下一步 npm run data:sync-catalog-layout && npm run data:sync-calendar`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

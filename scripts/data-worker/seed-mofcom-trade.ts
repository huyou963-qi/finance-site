import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { defaultEconomicCalendarRule, computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { fetchMofcomTradeHistory } from "../../src/lib/data/scheduler/mofcomTrade/client";
import { MOFCOM_TRADE_SOURCE, MOFCOM_TRADE_SOURCE_NOTE, MOFCOM_TRADE_SYNC_SCRIPT } from "../../src/lib/data/scheduler/mofcomTrade/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() {
  // `data:apply` uses this deployment-safe mode. The default remains the
  // explicit, idempotent full-history backfill command.
  const latestOnly = process.argv.includes("--latest-only");
  await prisma.statisticalAgency.upsert({ where: { id: "cn-mofcom" }, create: { id: "cn-mofcom", countryCode: "CN", nameZh: "商务部（海关统计转载）", nameEn: "Ministry of Commerce of China", websiteUrl: "https://data.mofcom.gov.cn/" }, update: { countryCode: "CN", nameZh: "商务部（海关统计转载）", nameEn: "Ministry of Commerce of China", websiteUrl: "https://data.mofcom.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: MOFCOM_TRADE_SOURCE.id }, create: { ...MOFCOM_TRADE_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { requestsPerMinute: 45, minIntervalMs: 1_000 } }, update: { agencyId: "cn-mofcom", name: MOFCOM_TRADE_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: MOFCOM_TRADE_SOURCE.baseUrl, termsUrl: MOFCOM_TRADE_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 45, minIntervalMs: 1_000 } } });
  console.log(latestOnly
    ? "[data:seed-mofcom-trade] 正在获取最新一期商务部转载的海关货物贸易数据（部署快速模式）…"
    : "[data:seed-mofcom-trade] 正在低频回填商务部转载的海关货物贸易公开历史…");
  const history = await fetchMofcomTradeHistory({ historical: !latestOnly }); const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY); const nextRunAt = computeNextRunAt(releaseRule); const probedAt = new Date().toISOString(); let observations = 0;
  for (const series of history.values()) {
    const previous = await prisma.instrument.findUnique({ where: { code: series.code }, select: { metadata: true } });
    const metadata = mergeFetchAcquisition({ ...(previous?.metadata as Record<string, unknown> ?? {}), sourceTag: "mofcom-customs-trade-api", bootstrapOnly: false, source: "商务部公共商务信息服务（海关总署统计）", sourceUrl: MOFCOM_TRADE_SOURCE.baseUrl, officialUrl: MOFCOM_TRADE_SOURCE.baseUrl, countryCode: "CN", countryNameZh: "中国", displayName: series.label, catalogCategory: series.category, freqLabel: "月", unit: series.unit, sourceUpdateNote: MOFCOM_TRADE_SOURCE_NOTE, scrape: { provider: "mofcom_trade", key: series.code, script: MOFCOM_TRADE_SYNC_SCRIPT } }, { status: "known", probedAt, method: "mofcom_public_customs_trade_json", methodLabel: MOFCOM_TRADE_SYNC_SCRIPT, fetchUrl: MOFCOM_TRADE_SOURCE.baseUrl, officialUrl: MOFCOM_TRADE_SOURCE.baseUrl, message: "商务部公开 JSON 接口；页面标注绝对数来自海关总署。用户明确授权后，历史扫描串行限速。" });
    const item = await prisma.instrument.upsert({ where: { code: series.code }, create: { code: series.code, kind: InstrumentKind.MACRO_SERIES, name: `中国：${series.label}`, shortName: series.label, description: "商务部公共商务信息服务转载海关货物贸易统计", freqLabel: "月", unit: series.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${series.code}`, agencyId: "cn-mofcom", sourceId: MOFCOM_TRADE_SOURCE.id } }, update: { name: `中国：${series.label}`, shortName: series.label, description: "商务部公共商务信息服务转载海关货物贸易统计", freqLabel: "月", unit: series.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: item.id }, create: { instrumentId: item.id, sourceId: MOFCOM_TRADE_SOURCE.id, sourceSeriesKey: series.code, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 43 }, update: { sourceId: MOFCOM_TRADE_SOURCE.id, sourceSeriesKey: series.code, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, releaseRule: releaseRule as object, nextRunAt, enabled: true, priority: 43 } });
    observations += (await upsertMacroObservations(prisma, item.id, series.points)).upserted;
  }
  console.log(`[data:seed-mofcom-trade] 完成：序列=${history.size}，${latestOnly ? "最新一期新增或修订" : "历史新增或修订"}=${observations}`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

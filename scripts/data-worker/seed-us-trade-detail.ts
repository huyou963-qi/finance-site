import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { fetchUsTradeDetail, US_TRADE_COUNTRY_END_PERIODS } from "../../src/lib/data/scheduler/usTradeDetail/client";
import { CENSUS_TRADE_API } from "../../src/lib/data/scheduler/usTradeDetail/api";
import { US_TRADE_FILES, US_TRADE_PACKAGE_ID, US_TRADE_PROVIDER, US_TRADE_SOURCE_ID } from "../../src/lib/data/scheduler/usTradeDetail/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { US_TRADE_HISTORICAL_COUNTRY_IDS, isHistoricalCensusSeries } from "../../src/lib/data/scheduler/usTradeDetail/lifecycle";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const full = process.argv.includes("--full-history");
  await prisma.statisticalAgency.upsert({
    where: { id: "us-census" },
    create: { id: "us-census", countryCode: "US", nameZh: "美国人口普查局", nameEn: "U.S. Census Bureau", websiteUrl: "https://www.census.gov/foreign-trade/" },
    update: { nameZh: "美国人口普查局", nameEn: "U.S. Census Bureau" },
  });
  const source = {
    agencyId: "us-census", name: "美国 Census FT-900 贸易商品与伙伴国滚动历史表",
    adapterKind: SourceAdapterKind.BULK_FILE,
    baseUrl: "https://www.census.gov/foreign-trade/statistics/",
    rateLimit: { requestsPerMinute: 12, minIntervalMs: 1000 },
    metadata: { sourceFiles: US_TRADE_FILES, acquisition: "official_public_xlsx", attribution: "Source: U.S. Census Bureau, Foreign Trade." },
  };
  await prisma.dataSource.upsert({ where: { id: US_TRADE_SOURCE_ID }, create: { id: US_TRADE_SOURCE_ID, ...source }, update: source });

  // Retire reviewed identities BEFORE downloading any workbook: an ongoing403
  // must not prevent lifecycle maintenance. Keep instruments/observations.
  const historicalCodes = US_TRADE_HISTORICAL_COUNTRY_IDS.flatMap(id =>
    ["exports", "imports"].map(side => `census_us_trade_${side}_country_nsa_${id}`));
  const historical = await prisma.dataSubscription.findMany({
    where: { sourceId: US_TRADE_SOURCE_ID, enabled: true, instrument: { code: { in: historicalCodes } } },
    select: { id: true, instrument: { select: { code: true } } },
  });
  for (const old of historical) {
    const id = old.instrument.code.slice(-4);
    await prisma.$transaction([
      prisma.dataSubscription.update({ where: { id: old.id }, data: { enabled: false } }),
      prisma.scheduleAuditEvent.create({ data: { subscriptionId: old.id,
        source: "catalog_seed", reason: "census_historical_country_subscription_retired",
        metadata: { code: old.instrument.code, officialLastPeriod: US_TRADE_COUNTRY_END_PERIODS[id] ?? null,
          evidenceUrl: `https://www.census.gov/foreign-trade/balance/c${id}.html`,
          observationsPreserved: true } } }),
    ]);
  }
  // Explicit historical seed only; an offline snapshot is not live update proof.
  const series = await fetchUsTradeDetail({ allowLocalSnapshot: true });
  let observations = 0;
  for (const [index, row] of series.entries()) {
    const old = await prisma.instrument.findUnique({ where: { code: row.code }, select: { metadata: true } });
    const metadata = {
      ...(old?.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {}),
      sourceTag: "us-census-ft900-detail", source: "U.S. Census Bureau", countryCode: "US", countryNameZh: "美国",
      catalogKey: `mds:${row.code}`, catalogCategory: "对外与汇率", catalogSubcategory: row.subgroup,
      displayName: row.label, freqLabel: "月", unit: "百万美元", seasonalAdjustment: row.seasonalAdjustment,
      stockFlow: "flow", referencePeriod: "month", geography: row.kind === "countries" || row.kind === "country_nsa" ? row.nameEn : "United States, all trading partners",
      sourceCode: row.sourceCode, sourceUrl: row.kind === "countries" ? US_TRADE_FILES.countries : row.kind === "country_nsa" ? US_TRADE_FILES.countriesNsa : US_TRADE_FILES[row.kind],
      officialUrl: row.kind === "countries" || row.kind === "country_nsa" ? "https://www.census.gov/foreign-trade/statistics/country/index.html" : "https://www.census.gov/foreign-trade/statistics/historical/seas.html",
      sourceUpdateNote: row.kind === "countries"
        ? "FT-900 选定伙伴国，经季调，Census 口径货物出口或进口；滚动历史文件每次完整回读修订。"
        : row.kind === "country_nsa" ? "Census 全伙伴国货物贸易，未季调。配置 CENSUS_API_KEY 后 worker 走官方 API 最近六个月，美元换算百万美元；更早历史修订须官方文件重读。文件原值百万美元，仅显式历史 seed 允许离线快照。"
        : "FT-900 按最终用途商品细目，经季调，Census 口径货物出口或进口；原值美元入库换算为百万美元，滚动历史文件每次完整回读修订。",
      scrape: { provider: US_TRADE_PROVIDER, key: row.code, script: "scripts/data-worker/sync-us-trade-detail.ts" },
      ...(row.kind === "country_nsa" ? { updateApiUrl: `${CENSUS_TRADE_API}/${row.code.includes("_exports_") ? "exports" : "imports"}/hs`, updateApiKeyEnv: "CENSUS_API_KEY", updateApiRevisionMonths: 6 } : {}),
      fetchAcquisition: { status: "known", probedAt: new Date().toISOString(), method: "us_census_official_ft900_xlsx", methodLabel: "scripts/data-worker/sync-us-trade-detail.ts", fetchUrl: row.kind === "countries" ? US_TRADE_FILES.countries : row.kind === "country_nsa" ? US_TRADE_FILES.countriesNsa : US_TRADE_FILES[row.kind], message: "Census 公开滚动历史 XLSX；完整回读捕获修订。" },
    };
    const fields = {
      name: `美国：${row.label}`, nameEn: `United States: ${row.nameEn}`, shortName: row.label,
      description: `U.S. Census Bureau FT-900, ${row.nameEn}; monthly ${row.seasonalAdjustment === "NSA" ? "not seasonally adjusted" : "seasonally adjusted"} goods ${row.code.includes("_imports_") ? "imports" : "exports"}, Census basis`,
      freqLabel: "月", unit: "百万美元", metadata,
      externalRefs: { catalogKey: `mds:${row.code}`, sourceId: US_TRADE_SOURCE_ID, agencyId: "us-census", sourceCode: row.sourceCode },
    };
    const instrument = await prisma.instrument.upsert({ where: { code: row.code }, create: { code: row.code, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const subscription = {
      sourceId: US_TRADE_SOURCE_ID, sourceSeriesKey: row.code, fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
      granularity: DataGranularity.MONTHLY, timezone: "America/New_York", releaseRule: defaultEconomicCalendarRule("MONTHLY") as object,
      revisionLookback: 600, enabled: !isHistoricalCensusSeries(row.code), priority: 7,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date() },
      update: subscription,
    });
    const points = full ? row.points : row.points.slice(-1);
    observations += (await upsertMacroObservations(prisma, instrument.id, points, { vintageSource: "us_census_ft900_seed" })).upserted;
    if ((index + 1) % 25 === 0) console.log(`[seed-us-trade-detail] ${index + 1}/${series.length} series, observations=${observations}`);
  }
  console.log(`[seed-us-trade-detail] complete series=${series.length} observations=${observations} full=${full} package=${US_TRADE_PACKAGE_ID}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

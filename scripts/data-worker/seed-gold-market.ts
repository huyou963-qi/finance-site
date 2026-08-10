/**
 * Gold analysis legacy workbook: confirm only the source contracts that have
 * been independently matched to an official, automatable source.
 *
 * `npm run data:seed-gold-market`
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { COT_MM_PRODUCTS } from "../../src/lib/data/cot/cotProductCatalog";
import { buildCotInstrumentMetadata, CFTC_COT_SOURCE } from "../../src/lib/data/scheduler/cotSeedCatalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { defaultEconomicCalendarRule, defaultReleaseRuleForGranularity, computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const BLS_PPI_SOURCE = {
  id: "bls-ppi",
  agencyId: "us-bls",
  name: "BLS Public Data API · PPI",
  baseUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data",
  termsUrl: "https://www.bls.gov/developers/",
  rateLimit: { requestsPerMinute: 20, minIntervalMs: 3_000 },
} as const;

const WORLD_BANK_SOURCE = {
  id: "worldbank",
  agencyId: "intl-wb",
  name: "World Bank Open Data API",
  baseUrl: "https://api.worldbank.org/v2",
  termsUrl: "https://data.worldbank.org/summary-terms-of-use",
  rateLimit: { requestsPerMinute: 20, minIntervalMs: 1_000 },
} as const;

const PENDING_RAW_SERIES: ReadonlyArray<{
  code: string;
  method: string;
  methodLabel: string;
  officialUrl?: string;
  message: string;
}> = [
  {
    code: "goldov_c01_comex_active",
    method: "licensed_cme_market_data",
    methodLabel: "CME 授权市场数据",
    officialUrl: "https://www.cmegroup.com/market-data.html",
    message: "活跃合约结算价需要 CME 数据许可；网站数据条款禁止自动抓取。",
  },
  {
    code: "goldov_c02_london_gold",
    method: "licensed_idc_market_data",
    methodLabel: "IDC/ICE Data 授权行情",
    message: "原始口径为 IDC 伦敦金现，不能用其他 LBMA/现货报价替代。",
  },
  {
    code: "goldov_c09_etf_holding",
    method: "methodology_required",
    methodLabel: "待提供黄金 ETF 汇总方法",
    message: "历史来源为“根据新闻整理”，缺少 ETF 范围、时区和汇总规则。",
  },
  {
    code: "goldov_c11_global_reserve",
    method: "methodology_required",
    methodLabel: "待提供全球黄金储备汇总方法",
    message: "历史来源为“根据新闻整理”，缺少国家范围和储备口径。",
  },
  {
    code: "goldov_c17_spdr_etf",
    method: "terms_review_required",
    methodLabel: "SPDR 发行人历史文件（待确认自动化条款）",
    officialUrl: "https://www.spdrgoldshares.com/",
    message: "已定位发行人数据候选，需确认历史下载、保存和展示许可后接通。",
  },
  {
    code: "goldov_c18_ishares_etf",
    method: "terms_review_required",
    methodLabel: "iShares 发行人历史文件（待确认自动化条款）",
    officialUrl: "https://www.ishares.com/us/products/239561/iau-ishares-gold-trust-fund",
    message: "需先锁定工作簿对应的 IAU 产品和数据使用许可。",
  },
  {
    code: "goldov_c19_gbs_etf",
    method: "vendor_mapping_required",
    methodLabel: "Wind 历史产品映射/授权",
    message: "需确认 GBS 的历史产品、发行人与授权，不能按名称替代。",
  },
  {
    code: "goldov_c20_phau_etf",
    method: "vendor_mapping_required",
    methodLabel: "Wind 历史产品映射/授权",
    message: "需确认 PHAU 的历史产品、发行人与授权，不能按名称替代。",
  },
  {
    code: "goldov_c21_sgbs_etf",
    method: "vendor_mapping_required",
    methodLabel: "Wind 历史产品映射/授权",
    message: "需确认 SGBS 的历史产品、发行人与授权，不能按名称替代。",
  },
  {
    code: "goldov_c22_gold_etf",
    method: "vendor_mapping_required",
    methodLabel: "Wind 历史产品映射/授权",
    message: "GOLD 不是唯一产品标识，需确认历史产品、发行人与授权。",
  },
  {
    code: "goldov_c23_comex_stock_oz",
    method: "licensed_cme_report_feed",
    methodLabel: "CME Gold Stocks 授权报告/数据源",
    officialUrl: "https://www.cmegroup.com/solutions/clearing/operations-and-deliveries/nymex-delivery-notices.html",
    message: "精确口径为 CME Gold Stocks；网站数据条款明确禁止脚本抓取，需取得报告/API 许可。",
  },
  {
    code: "goldov_c24_global_reserve_tons",
    method: "methodology_required",
    methodLabel: "待提供全球黄金储备汇总方法",
    message: "与 c11 历史值不满足标准盎司换算，不能擅自作为单位派生。",
  },
  {
    code: "goldov_c25_etf_holding_tons",
    method: "methodology_required",
    methodLabel: "待提供黄金 ETF 汇总方法",
    message: "与 c09 历史值不满足标准盎司换算，需 ETF 范围和汇总算法。",
  },
  {
    code: "goldov_c26_dxy",
    method: "licensed_ice_index_data",
    methodLabel: "ICE U.S. Dollar Index 授权数据",
    officialUrl: "https://www.ice.com/forex/usdx",
    message: "必须使用 ICE DXY；广义美元指数不是同一口径。",
  },
  {
    code: "goldov_c27_brent",
    method: "licensed_ice_futures_data",
    methodLabel: "ICE Brent 连续期货结算价授权数据",
    officialUrl: "https://www.ice.com/brent-crude",
    message: "必须使用 ICE 连续期货结算价；EIA/FRED 布伦特现货不是同一口径。",
  },
  {
    code: "usov_c28_sp500_pe",
    method: "vendor_definition_required",
    methodLabel: "Wind/S&P 500 PE 口径与授权待确认",
    message: "需先确认 trailing/forward、收益口径和指数版本，不能用其他 S&P 估值比率替代。",
  },
];

const DERIVED_SERIES: ReadonlyArray<{ code: string; formula: string }> = [
  { code: "goldov_c03_basis", formula: "goldov_c01_comex_active - goldov_c02_london_gold" },
  { code: "goldov_c07_comex_stock", formula: "goldov_c23_comex_stock_oz / 1000000" },
  { code: "goldov_c08_comex_stock_wow", formula: "goldov_c07_comex_stock(t) - goldov_c07_comex_stock(t-1)" },
  { code: "goldov_c10_etf_holding_wow", formula: "goldov_c09_etf_holding(t) - goldov_c09_etf_holding(t-1)" },
  { code: "goldov_c16_etf_tons_wow", formula: "goldov_c25_etf_holding_tons(t) - goldov_c25_etf_holding_tons(t-1)" },
];

function existingMetadata(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

async function latestObsDate(instrumentId: string): Promise<Date | null> {
  const row = await prisma.macroObservation.findFirst({
    where: { instrumentId },
    orderBy: { obsDate: "desc" },
    select: { obsDate: true },
  });
  return row?.obsDate ?? null;
}

async function ensureSources() {
  await prisma.statisticalAgency.upsert({
    where: { id: "us-cftc" },
    create: {
      id: "us-cftc",
      countryCode: "US",
      nameZh: "美国商品期货交易委员会",
      nameEn: "U.S. Commodity Futures Trading Commission",
      websiteUrl: "https://www.cftc.gov/",
    },
    update: {},
  });
  await prisma.statisticalAgency.upsert({
    where: { id: "us-bls" },
    create: {
      id: "us-bls",
      countryCode: "US",
      nameZh: "美国劳工统计局",
      nameEn: "Bureau of Labor Statistics",
      websiteUrl: "https://www.bls.gov/",
    },
    update: {},
  });
  await prisma.statisticalAgency.upsert({
    where: { id: "intl-wb" },
    create: {
      id: "intl-wb",
      countryCode: "US",
      nameZh: "世界银行开放数据",
      nameEn: "World Bank Open Data",
      websiteUrl: "https://data.worldbank.org/",
    },
    update: {},
  });

  for (const source of [
    { ...CFTC_COT_SOURCE, adapterKind: SourceAdapterKind.REST_API },
    { ...BLS_PPI_SOURCE, adapterKind: SourceAdapterKind.REST_API },
    { ...WORLD_BANK_SOURCE, adapterKind: SourceAdapterKind.WORLD_BANK_API },
  ]) {
    await prisma.dataSource.upsert({
      where: { id: source.id },
      create: source,
      update: {
        agencyId: source.agencyId,
        name: source.name,
        adapterKind: source.adapterKind,
        baseUrl: source.baseUrl,
        termsUrl: source.termsUrl,
        rateLimit: source.rateLimit,
      },
    });
  }
}

async function seedCftcNet() {
  const code = "goldov_c06_mm_net";
  const existing = await prisma.instrument.findUnique({ where: { code } });
  if (!existing) throw new Error(`${code} 不存在；请先导入黄金分析历史工作簿`);
  const product = COT_MM_PRODUCTS.find((row) => row.slug === "gold");
  if (!product) throw new Error("CFTC Gold 产品配置缺失");
  const acquisition = {
    status: "known" as const,
    probedAt: new Date().toISOString(),
    method: "cftc_socrata_api",
    methodLabel: "CFTC Socrata API（Managed Money 多头减空头）",
    officialUrl: CFTC_COT_SOURCE.termsUrl,
    fetchUrl: CFTC_COT_SOURCE.baseUrl,
    message: "逐点核对 875 个与历史工作簿重叠周，差异为 0",
  };
  const metadata = {
    ...existingMetadata(existing.metadata),
    ...buildCotInstrumentMetadata(product, "net", acquisition),
    fetchAcquisition: acquisition,
  };
  const rule = defaultReleaseRuleForGranularity(DataGranularity.WEEKLY);
  const instrument = await prisma.instrument.update({
    where: { id: existing.id },
    data: { metadata },
  });
  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      sourceId: CFTC_COT_SOURCE.id,
      sourceSeriesKey: "kh3c-gbw2:gold:net",
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.WEEKLY,
      releaseRule: rule,
      nextRunAt: computeNextRunAt(rule),
      lastObsDate: await latestObsDate(instrument.id),
      enabled: true,
      priority: 8,
      revisionLookback: 2,
    },
    update: {
      sourceId: CFTC_COT_SOURCE.id,
      sourceSeriesKey: "kh3c-gbw2:gold:net",
      granularity: DataGranularity.WEEKLY,
      releaseRule: rule,
      enabled: true,
      priority: 8,
      revisionLookback: 2,
      lastObsDate: await latestObsDate(instrument.id),
    },
  });
  console.log(`  ✓ ${code} ← CFTC Socrata API`);
}

async function seedBlsPpi() {
  const code = "goldov_c15_ppi_yoy";
  const existing = await prisma.instrument.findUnique({ where: { code } });
  if (!existing) throw new Error(`${code} 不存在；请先导入黄金分析历史工作簿`);
  const acquisition = {
    status: "known" as const,
    probedAt: new Date().toISOString(),
    method: "bls_public_api",
    methodLabel: "BLS Public Data API（WPU00000000，官方指数计算同比）",
    officialUrl: "https://www.bls.gov/ppi/data-retrieval-guide/",
    fetchUrl: `${BLS_PPI_SOURCE.baseUrl}/WPU00000000`,
    message: "与工作簿重叠历史的四舍五入差异不超过 0.05 个百分点",
  };
  const metadata = mergeFetchAcquisition(
    {
      ...existingMetadata(existing.metadata),
      scrape: {
        provider: "bls_ppi",
        seriesId: "WPU00000000",
        transform: "yoy_pct",
        historyStart: "1914-01-01",
      },
    },
    acquisition,
  );
  const rule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const instrument = await prisma.instrument.update({
    where: { id: existing.id },
    data: { metadata },
  });
  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      sourceId: BLS_PPI_SOURCE.id,
      sourceSeriesKey: "WPU00000000:yoy",
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.MONTHLY,
      releaseRule: rule,
      nextRunAt: computeNextRunAt(rule),
      lastObsDate: await latestObsDate(instrument.id),
      enabled: true,
      priority: 8,
      revisionLookback: 14,
    },
    update: {
      sourceId: BLS_PPI_SOURCE.id,
      sourceSeriesKey: "WPU00000000:yoy",
      granularity: DataGranularity.MONTHLY,
      releaseRule: rule,
      enabled: true,
      priority: 8,
      revisionLookback: 14,
      lastObsDate: await latestObsDate(instrument.id),
    },
  });
  console.log(`  ✓ ${code} ← BLS WPU00000000`);
}

async function seedWorldBankRealRate() {
  const code = "goldov_c28_real_rate";
  const existing = await prisma.instrument.findUnique({ where: { code } });
  if (!existing) throw new Error(`${code} 不存在；请先导入黄金分析历史工作簿`);
  const acquisition = {
    status: "known" as const,
    probedAt: new Date().toISOString(),
    method: "worldbank_api",
    methodLabel: "World Bank Open Data API（FR.INR.RINR）",
    officialUrl: "https://data.worldbank.org/indicator/FR.INR.RINR?locations=US",
    fetchUrl: "https://api.worldbank.org/v2/country/US/indicator/FR.INR.RINR?format=json",
    message: "工作簿数值与 World Bank 年度值四舍五入至两位小数一致；保留年末观测日期",
  };
  const metadata = mergeFetchAcquisition(
    {
      ...existingMetadata(existing.metadata),
      worldbank: { annualObservationDate: "year_end", historyStartYear: 1961 },
    },
    acquisition,
  );
  const rule = defaultReleaseRuleForGranularity(DataGranularity.ANNUAL);
  const instrument = await prisma.instrument.update({
    where: { id: existing.id },
    data: { metadata },
  });
  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      sourceId: WORLD_BANK_SOURCE.id,
      sourceSeriesKey: "US:FR.INR.RINR",
      fetchMethod: DataFetchMethod.API,
      granularity: DataGranularity.ANNUAL,
      releaseRule: rule,
      nextRunAt: computeNextRunAt(rule),
      lastObsDate: await latestObsDate(instrument.id),
      enabled: true,
      priority: 5,
      revisionLookback: 24,
    },
    update: {
      sourceId: WORLD_BANK_SOURCE.id,
      sourceSeriesKey: "US:FR.INR.RINR",
      granularity: DataGranularity.ANNUAL,
      releaseRule: rule,
      enabled: true,
      priority: 5,
      revisionLookback: 24,
      lastObsDate: await latestObsDate(instrument.id),
    },
  });
  console.log(`  ✓ ${code} ← World Bank FR.INR.RINR`);
}

async function markPendingAndDerived() {
  const probedAt = new Date().toISOString();
  for (const row of PENDING_RAW_SERIES) {
    const instrument = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!instrument) throw new Error(`${row.code} 不存在；请先导入黄金分析历史工作簿`);
    const metadata = mergeFetchAcquisition(existingMetadata(instrument.metadata), {
      status: "pending",
      probedAt,
      method: row.method,
      methodLabel: row.methodLabel,
      officialUrl: row.officialUrl,
      message: row.message,
    });
    await prisma.instrument.update({ where: { id: instrument.id }, data: { metadata } });
  }
  for (const row of DERIVED_SERIES) {
    const instrument = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!instrument) throw new Error(`${row.code} 不存在；请先导入黄金分析历史工作簿`);
    const metadata = {
      ...existingMetadata(instrument.metadata),
      derivation: { formula: row.formula, upstreamStatus: "pending_raw_source" },
    };
    await prisma.instrument.update({ where: { id: instrument.id }, data: { metadata } });
  }
  console.log(`  · 已标记 ${PENDING_RAW_SERIES.length} 条待授权/待方法原始口径，以及 ${DERIVED_SERIES.length} 条派生项`);
}

async function main() {
  console.log("[data:seed-gold-market] 写入已验证的黄金分析原始口径订阅…");
  await ensureSources();
  await seedCftcNet();
  await seedBlsPpi();
  await seedWorldBankRealRate();
  await markPendingAndDerived();
  console.log("[data:seed-gold-market] 完成；其余 legacy 原始市场口径见 onboarding spec，未获数据授权前不会自动抓取。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

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
import { IMF_IL_GOLD_KEY, IMF_IL_GOLD_URL } from "../../src/lib/data/scheduler/adapters/imfIlGoldAdapter";
import { GLOBAL_X_GOLD_PAGE_URL, ISHARES_IAU_PAGE_URL, SPDR_GLD_ARCHIVE_URL, WGC_GOLD_ETF_PAGE_URL, WISDOMTREE_GBS_BARLIST_URL, WISDOMTREE_SGBS_BARLIST_URL } from "../../src/lib/data/scheduler/goldEtfHoldings/client";
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

const IMF_IL_SOURCE = {
  id: "imf-il",
  agencyId: "intl-imf",
  name: "IMF International Liquidity (IL) SDMX 3.0 API",
  baseUrl: "https://api.imf.org/external/sdmx/3.0",
  termsUrl: "https://www.imf.org/external/terms.htm",
  rateLimit: { requestsPerMinute: 30, minIntervalMs: 2_000 },
} as const;

const GOLD_ETF_SOURCES = [
  {
    id: "spdr-gold-shares",
    agencyId: "us-wgts",
    name: "SPDR Gold Shares official historical archive",
    baseUrl: "https://api.spdrgoldshares.com/api/v1",
    termsUrl: "https://www.spdrgoldshares.com/usa/terms-and-conditions/",
    rateLimit: { requestsPerMinute: 2, minIntervalMs: 30_000 },
  },
  {
    id: "ishares-gold-trust",
    agencyId: "us-blackrock",
    name: "iShares Gold Trust official product disclosure",
    baseUrl: "https://www.ishares.com/us/products/239561",
    termsUrl: "https://www.blackrock.com/corporate/compliance/terms-and-conditions",
    rateLimit: { requestsPerMinute: 2, minIntervalMs: 30_000 },
  },
  {
    id: "globalx-australia",
    agencyId: "au-globalx",
    name: "Global X Australia official fund files",
    baseUrl: "https://www.globalxetfs.com.au/funds/gold/",
    termsUrl: "https://www.globalxetfs.com.au/terms-and-conditions/",
    rateLimit: { requestsPerMinute: 2, minIntervalMs: 30_000 },
  },
  {
    id: "wisdomtree-dataspan",
    agencyId: "us-wisdomtree",
    name: "WisdomTree Dataspan official custodian bar lists",
    baseUrl: "https://dataspanapi.wisdomtree.com/pdr/documents/METALBAR",
    termsUrl: "https://www.wisdomtree.com/gb/terms-and-conditions",
    rateLimit: { requestsPerMinute: 2, minIntervalMs: 30_000 },
  },
  {
    id: "wgc-goldhub",
    agencyId: "intl-wgc",
    name: "World Gold Council Goldhub licensed monthly ETF workbook",
    baseUrl: WGC_GOLD_ETF_PAGE_URL,
    termsUrl: "https://www.gold.org/terms-and-conditions",
    rateLimit: { requestsPerMinute: 2, minIntervalMs: 30_000 },
  },
] as const;

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
    method: "derived_upstream_endpoint_required",
    methodLabel: "六只 legacy 黄金 ETF 合计的常衡盎司换算（PHAU 月表接入待授权会话）",
    message: "已复原为 c25 × 35.2739619495804 / 1000；legacy 标签虽写盎司，实际为常衡盎司。六只上游均已接通，但 PHAU 是月频，只有六只严格同一官方 as-of 日期时才允许刷新聚合。",
  },
  {
    code: "goldov_c23_comex_stock_oz",
    method: "licensed_cme_report_feed",
    methodLabel: "CME Gold Stocks 授权报告/数据源",
    officialUrl: "https://www.cmegroup.com/solutions/clearing/operations-and-deliveries/nymex-delivery-notices.html",
    message: "精确口径为 CME Gold Stocks；网站数据条款明确禁止脚本抓取，需取得报告/API 许可。",
  },
  {
    code: "goldov_c25_etf_holding_tons",
    method: "derived_upstream_endpoint_required",
    methodLabel: "六只 legacy 黄金 ETF 吨数合计（PHAU 月表接入待授权会话）",
    message: "已复原为 c17+c18+c19+c20+c21+c22；4039 个重叠日最大差 0.02 吨。六只上游均已接通，但 PHAU 是月频；禁止前向填充，只有六只严格同一官方 as-of 日期时才刷新。",
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

/** 已由其他美元指数覆盖的 legacy 工作簿序列；部署时幂等清理并留下 tombstone。 */
const RETIRED_SERIES = ["goldov_c26_dxy"] as const;

const DERIVED_SERIES: ReadonlyArray<{ code: string; formula: string }> = [
  { code: "goldov_c03_basis", formula: "goldov_c01_comex_active - goldov_c02_london_gold" },
  { code: "goldov_c07_comex_stock", formula: "goldov_c23_comex_stock_oz / 1000000" },
  { code: "goldov_c08_comex_stock_wow", formula: "goldov_c07_comex_stock(t) - goldov_c07_comex_stock(t-1)" },
  { code: "goldov_c09_etf_holding", formula: "goldov_c25_etf_holding_tons * 35.2739619495804 / 1000" },
  { code: "goldov_c10_etf_holding_wow", formula: "goldov_c09_etf_holding(t) - goldov_c09_etf_holding(t-1)" },
  { code: "goldov_c11_global_reserve", formula: "goldov_c24_global_reserve_tons * 35.2739619495804 / 1000" },
  { code: "goldov_c16_etf_tons_wow", formula: "goldov_c25_etf_holding_tons(t) - goldov_c25_etf_holding_tons(t-1)" },
  { code: "goldov_c25_etf_holding_tons", formula: "goldov_c17_spdr_etf + goldov_c18_ishares_etf + goldov_c19_gbs_etf + goldov_c20_phau_etf + goldov_c21_sgbs_etf + goldov_c22_gold_etf" },
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
  for (const agency of [
    { id: "us-wgts", countryCode: "US", nameZh: "世界黄金信托服务", nameEn: "World Gold Trust Services", websiteUrl: "https://www.spdrgoldshares.com/" },
    { id: "us-blackrock", countryCode: "US", nameZh: "贝莱德", nameEn: "BlackRock", websiteUrl: "https://www.ishares.com/" },
    { id: "au-globalx", countryCode: "AU", nameZh: "Global X 澳大利亚", nameEn: "Global X Australia", websiteUrl: "https://www.globalxetfs.com.au/" },
    { id: "us-wisdomtree", countryCode: "US", nameZh: "WisdomTree", nameEn: "WisdomTree", websiteUrl: "https://www.wisdomtree.com/" },
    { id: "intl-wgc", countryCode: "IM", nameZh: "世界黄金协会", nameEn: "World Gold Council", websiteUrl: "https://www.gold.org/" },
  ]) {
    await prisma.statisticalAgency.upsert({
      where: { id: agency.id },
      create: agency,
      update: { countryCode: agency.countryCode, nameZh: agency.nameZh, nameEn: agency.nameEn, websiteUrl: agency.websiteUrl },
    });
  }
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
    where: { id: IMF_IL_SOURCE.agencyId },
    create: {
      id: IMF_IL_SOURCE.agencyId,
      countryCode: "IM",
      nameZh: "国际货币基金组织",
      nameEn: "International Monetary Fund",
      websiteUrl: "https://data.imf.org/",
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
    { ...IMF_IL_SOURCE, adapterKind: SourceAdapterKind.REST_API },
    ...GOLD_ETF_SOURCES.map((source) => ({ ...source, adapterKind: SourceAdapterKind.REST_API })),
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

async function seedGoldEtfHoldings() {
  const rows = [
    {
      code: "goldov_c17_spdr_etf",
      product: "gld",
      sourceId: "spdr-gold-shares",
      sourceSeriesKey: "GLD:tonnes-of-gold",
      url: SPDR_GLD_ARCHIVE_URL,
      method: "issuer_archive_xlsx",
      methodLabel: "SPDR Gold Shares 官方 Historical Archive XLSX · Tonnes of Gold",
      message: "项目于 2026-08-22 确认已取得自动下载、保存、入库及站内展示许可；官方文件提供全历史每日吨数。",
      revisionLookback: 10,
    },
    {
      code: "goldov_c18_ishares_etf",
      product: "iau",
      sourceId: "ishares-gold-trust",
      sourceSeriesKey: "IAU:tonnes-in-trust",
      url: ISHARES_IAU_PAGE_URL,
      method: "issuer_product_disclosure",
      methodLabel: "iShares Gold Trust 官方产品页 · Tonnes in Trust",
      message: "项目于 2026-08-22 确认已取得自动下载、保存、入库及站内展示许可；官方 Data Download 历史表不含吨数，故只用产品页直接披露值做增量，不以 NAV/金价反推。",
      revisionLookback: 3,
    },
    {
      code: "goldov_c19_gbs_etf",
      product: "wisdomtree-gbs-barlist",
      sourceId: "wisdomtree-dataspan",
      sourceSeriesKey: "GB00B00FHZ82:allocated-fine-ounces",
      url: WISDOMTREE_GBS_BARLIST_URL,
      method: "issuer_custodian_barlist_pdf",
      methodLabel: "WisdomTree Dataspan · GBS 独立发行人托管账户 bar list PDF",
      message: "PDF 以 LAW DEBENTURE TRUST RE GBS 锁定独立发行人账户，直接读取 Total Allocated Fine Weight 并转吨；不是 AUM、NAV、价格或份额反推。",
      revisionLookback: 3,
    },
    {
      code: "goldov_c21_sgbs_etf",
      product: "wisdomtree-sgbs-barlist",
      sourceId: "wisdomtree-dataspan",
      sourceSeriesKey: "JE00B588CD74:allocated-fine-ounces",
      url: WISDOMTREE_SGBS_BARLIST_URL,
      method: "issuer_custodian_barlist_pdf",
      methodLabel: "WisdomTree Dataspan · SGBS 产品托管账户 bar list PDF",
      message: "PDF 以 WisdomTree Physical Swiss Gold 产品全名锁定账户，直接读取 Total Fine Ounces 并转吨；不是 AUM、NAV、价格或份额反推。",
      revisionLookback: 3,
    },
    {
      code: "goldov_c20_phau_etf",
      product: "wgc-phau-monthly",
      sourceId: "wgc-goldhub",
      sourceSeriesKey: "JE00B1VS3770:WGC-monthly-holdings-tonnes",
      url: WGC_GOLD_ETF_PAGE_URL,
      method: "licensed_wgc_monthly_xlsx",
      methodLabel: "WGC Gold ETF Holdings and Flows · PHAU 月度直接吨数",
      message: "许可会话动态发现当前月表；以 ISIN JE00B1VS3770（若文件披露）优先，否则以唯一的 PHAU LN Equity + WisdomTree Physical Gold 双锚点匹配。legacy 重叠期存在历史修订差异，故只从 2026-06-05 后拼接，不覆盖旧值。",
      revisionLookback: 2,
      sourceStartDate: "2026-06-05",
    },
    {
      code: "goldov_c22_gold_etf",
      product: "globalx-gold",
      sourceId: "globalx-australia",
      sourceSeriesKey: "AU00000GOLD7:UOI*metal-entitlement",
      url: GLOBAL_X_GOLD_PAGE_URL,
      method: "issuer_nav_and_metal_entitlement_xlsx",
      methodLabel: "Global X GOLD 官方 NAV/UOI + Metal Entitlement XLSX",
      message: "项目于 2026-08-22 确认已取得自动下载、保存、入库及站内展示许可；吨数严格为同日 UOI × 每单位金衡盎司 / 32,150.74656862798。官方 entitlement 文件从 2022-02-01 起覆盖，之前保留 legacy 历史。",
      revisionLookback: 10,
    },
  ] as const;
  for (const row of rows) {
    const monthly = row.product === "wgc-phau-monthly";
    const rule = { type: "probe_interval" as const, intervalHours: monthly ? 168 : 24 };
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!existing) throw new Error(`${row.code} 不存在；请先导入黄金分析历史工作簿`);
    const acquisition = {
      status: "known" as const,
      probedAt: new Date().toISOString(),
      method: row.method,
      methodLabel: row.methodLabel,
      officialUrl: row.url,
      fetchUrl: row.url,
      message: row.message,
    };
    const metadata = mergeFetchAcquisition(
      {
        ...existingMetadata(existing.metadata),
        ...(monthly
          ? {
              frequencyTransition: {
                legacy: "daily through 2026-06-04",
                current: "WGC monthly as-of observations from 2026-06-05",
                forwardFill: false,
              },
            }
          : {}),
        scrape: {
          provider: "gold_etf_holdings",
          product: row.product,
          url: row.url,
          ...("sourceStartDate" in row ? { sourceStartDate: row.sourceStartDate } : {}),
        },
      },
      acquisition,
    );
    const instrument = await prisma.instrument.update({
      where: { id: existing.id },
      data: { unit: "吨", freqLabel: monthly ? "月" : "日", metadata },
    });
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: row.sourceId,
        sourceSeriesKey: row.sourceSeriesKey,
        fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
        granularity: monthly ? DataGranularity.MONTHLY : DataGranularity.DAILY,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule),
        lastObsDate: await latestObsDate(instrument.id),
        enabled: true,
        priority: 8,
        revisionLookback: row.revisionLookback,
      },
      update: {
        sourceId: row.sourceId,
        sourceSeriesKey: row.sourceSeriesKey,
        fetchMethod: DataFetchMethod.BULK_DOWNLOAD,
        granularity: monthly ? DataGranularity.MONTHLY : DataGranularity.DAILY,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule),
        lastObsDate: await latestObsDate(instrument.id),
        enabled: true,
        priority: 8,
        revisionLookback: row.revisionLookback,
        retryCount: 0,
        lastError: null,
      },
    });
    console.log(`  ✓ ${row.code} ← ${row.sourceSeriesKey}`);
  }
}

async function seedImfOfficialGoldReserves() {
  const definitions = [
    {
      code: "goldov_c24_global_reserve_tons",
      unit: "吨",
      sourceSeriesKey: `${IMF_IL_GOLD_KEY}:metric_tons`,
      transform: "metric_tons",
      message: "IMF IL 官方 World (G001) Gold reserves volume；原始 fine troy ounces 按 32,150.74656862798 盎司/吨换算。",
    },
    {
      code: "goldov_c11_global_reserve",
      unit: "百万盎司",
      sourceSeriesKey: `${IMF_IL_GOLD_KEY}:legacy_avoirdupois_million_ounces`,
      transform: "legacy_avoirdupois_million_ounces",
      message: "严格由 c24 × 35.2739619495804 / 1,000 派生，保留 legacy 常衡盎司口径。",
    },
  ] as const;
  const rule = { type: "probe_interval" as const, intervalHours: 72 };
  for (const definition of definitions) {
    const existing = await prisma.instrument.findUnique({ where: { code: definition.code } });
    if (!existing) throw new Error(`${definition.code} 不存在；请先导入黄金分析历史工作簿`);
    const acquisition = {
      status: "known" as const,
      probedAt: new Date().toISOString(),
      method: "imf_sdmx_3_api",
      methodLabel: "IMF SDMX 3.0 · International Liquidity · World gold volume",
      officialUrl: "https://data.imf.org/en/Datasets/IL",
      fetchUrl: IMF_IL_GOLD_URL,
      sampleObsDate: "2026-06-30",
      message: definition.message,
    };
    const metadata = mergeFetchAcquisition(
      {
        ...existingMetadata(existing.metadata),
        sourceTag: "imf-il-gold",
        countryCode: "SRC_IMF",
        countryNameZh: "国际货币基金组织（IMF）",
        catalogCategory: "官方黄金储备",
        imfSdmx: {
          agency: "IMF.STA",
          dataflow: "IL",
          key: IMF_IL_GOLD_KEY,
          country: "G001",
          countryLabel: "World",
          indicator: "RGV_REVS",
          unit: "FTO",
          frequency: "M",
          transform: definition.transform,
        },
      },
      acquisition,
    );
    const instrument = await prisma.instrument.update({
      where: { id: existing.id },
      data: { freqLabel: "月", unit: definition.unit, metadata },
    });
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: IMF_IL_SOURCE.id,
        sourceSeriesKey: definition.sourceSeriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule),
        lastObsDate: await latestObsDate(instrument.id),
        enabled: true,
        priority: 7,
        revisionLookback: 6,
      },
      update: {
        sourceId: IMF_IL_SOURCE.id,
        sourceSeriesKey: definition.sourceSeriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: rule,
        nextRunAt: computeNextRunAt(rule),
        lastObsDate: await latestObsDate(instrument.id),
        enabled: true,
        priority: 7,
        revisionLookback: 6,
        retryCount: 0,
        lastError: null,
      },
    });
    console.log(`  ✓ ${definition.code} ← IMF IL ${IMF_IL_GOLD_KEY}`);
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
  console.log(`  · 已标记 ${PENDING_RAW_SERIES.length} 条待授权/待接通口径，以及 ${DERIVED_SERIES.length} 条已确认派生项`);
}

async function deleteRetiredSeries() {
  for (const code of RETIRED_SERIES) {
    const key = `mds:${code}`;
    const instrument = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.macroCatalogExcludedKey.upsert({
        where: { catalogKey: key },
        create: { catalogKey: key, deletedBy: "data:seed-gold-market" },
        update: { deletedAt: new Date(), deletedBy: "data:seed-gold-market" },
      });
      if (!instrument) return;
      await tx.fetchRun.deleteMany({ where: { subscription: { instrumentId: instrument.id } } });
      await tx.releasePackageMember.deleteMany({ where: { instrumentId: instrument.id } });
      await tx.dataSubscription.deleteMany({ where: { instrumentId: instrument.id } });
      await tx.instrument.delete({ where: { id: instrument.id } });
    });
    console.log(`  ✓ 已退役并删除 ${code}`);
  }
}

async function main() {
  console.log("[data:seed-gold-market] 写入已验证的黄金分析原始口径订阅…");
  await deleteRetiredSeries();
  await ensureSources();
  await seedCftcNet();
  await seedBlsPpi();
  await seedWorldBankRealRate();
  await markPendingAndDerived();
  await seedGoldEtfHoldings();
  await seedImfOfficialGoldReserves();
  console.log("[data:seed-gold-market] 完成；其余 legacy 原始市场口径见 onboarding spec。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

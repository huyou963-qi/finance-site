/**
 * 欧元区综合 PMI（S&P Global HCOB Composite PMI，制造业+服务业综合）——
 * 种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * FRED 无该序列镜像（S&P Global/Markit 系 PMI 为商业授权，未见 FRED 转载，已核实）。
 *
 * 归类：编制方 S&P Global 为美国上市公司（NYSE: SPGI），比照 CFTC COT（美国机构
 * 发布的外国货币期货持仓数据仍归 countryCode=US）的既有惯例，本序列归入美国
 * 「对外与汇率 · 海外PMI」——用于分析美股外需传导，不新建欧元区独立国家树。
 *
 * npm run data:seed-euro-composite-pmi-te
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";
import { usMetadataCatalogCategory } from "../../src/lib/data/usCatalogTaxonomy";
import {
  EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
  EURO_COMPOSITE_PMI_SCRAPE_PROVIDER,
  EURO_COMPOSITE_PMI_TE_SYNC_SCRIPT,
  TE_EURO_COMPOSITE_PMI_PAGE_URL,
} from "../../src/lib/data/scheduler/tradingEconomicsIndicator/euroCompositePmiCatalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const AGENCY_ID = "sp-global-pmi";
const SOURCE_ID = "te-eurozone-composite-pmi";

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: AGENCY_ID },
    create: {
      id: AGENCY_ID,
      countryCode: "US",
      nameZh: "标准普尔（S&P Global）",
      nameEn: "S&P Global",
      websiteUrl: "https://www.pmi.spglobal.com/public",
    },
    update: {
      nameZh: "标准普尔（S&P Global）",
      nameEn: "S&P Global",
      websiteUrl: "https://www.pmi.spglobal.com/public",
    },
  });

  await prisma.dataSource.upsert({
    where: { id: SOURCE_ID },
    create: {
      id: SOURCE_ID,
      agencyId: AGENCY_ID,
      name: "TradingEconomics · 欧元区综合 PMI",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
      termsUrl: "https://tradingeconomics.com/information/terms-and-conditions.aspx",
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: AGENCY_ID,
      name: "TradingEconomics · 欧元区综合 PMI",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
    },
  });

  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  const catalogCategory = usMetadataCatalogCategory({ code: EURO_COMPOSITE_PMI_INSTRUMENT_CODE });

  const existing = await prisma.instrument.findUnique({
    where: { code: EURO_COMPOSITE_PMI_INSTRUMENT_CODE },
  });
  const prevMd =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const metadata = mergeFetchAcquisition(
    {
      ...prevMd,
      bootstrapOnly: false,
      source: "TradingEconomics",
      providerNote: "S&P Global（HCOB Eurozone Composite PMI）",
      sourceUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
      officialUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
      countryCode: "US",
      countryNameZh: "美国",
      displayName: "欧元区综合PMI（制造业+服务业，S&P Global编制）",
      catalogCategory,
      catalogKey: `mds:${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}`,
      freqLabel: "月",
      unit: "指数",
      sourceUpdateNote:
        "S&P Global HCOB 月度制造业+服务业综合采购经理人调查终值（Final，非 Flash 初值）；" +
        "TE 页无 #calendar 发布表，最新值取自页面叙述段；历史仅自本次接入起累积（S&P Global 全历史数据为付费订阅，未开放）。",
      scrape: {
        provider: EURO_COMPOSITE_PMI_SCRAPE_PROVIDER,
        url: TE_EURO_COMPOSITE_PMI_PAGE_URL,
        component: "headline",
        teLabel: "S&P Global Composite PMI Final",
        script: EURO_COMPOSITE_PMI_TE_SYNC_SCRIPT,
      },
    },
    {
      status: "known",
      probedAt,
      method: "te_eurozone_composite_pmi_scrape",
      methodLabel: EURO_COMPOSITE_PMI_TE_SYNC_SCRIPT,
      fetchUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
      officialUrl: TE_EURO_COMPOSITE_PMI_PAGE_URL,
      message: "TradingEconomics 欧元区综合 PMI 页 HTML 抓取",
    },
  );

  const instrument = await prisma.instrument.upsert({
    where: { code: EURO_COMPOSITE_PMI_INSTRUMENT_CODE },
    create: {
      code: EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
      kind: InstrumentKind.MACRO_SERIES,
      name: "欧元区：标普全球综合PMI（制造业+服务业）",
      freqLabel: "月",
      unit: "指数",
      metadata: metadata as object,
      externalRefs: {
        catalogKey: `mds:${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}`,
        agencyId: AGENCY_ID,
        sourceId: SOURCE_ID,
      },
    },
    update: {
      freqLabel: "月",
      unit: existing?.unit?.trim() ? existing.unit : "指数",
      metadata: metadata as object,
      externalRefs: {
        catalogKey: `mds:${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}`,
        agencyId: AGENCY_ID,
        sourceId: SOURCE_ID,
      },
    },
  });

  await prisma.dataSubscription.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      sourceId: SOURCE_ID,
      sourceSeriesKey: EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
      granularity: DataGranularity.MONTHLY,
      fetchMethod: DataFetchMethod.API,
      enabled: true,
      priority: 50,
      releaseRule: releaseRule as object,
      nextRunAt,
    },
    update: {
      sourceId: SOURCE_ID,
      sourceSeriesKey: EURO_COMPOSITE_PMI_INSTRUMENT_CODE,
      granularity: DataGranularity.MONTHLY,
      fetchMethod: DataFetchMethod.API,
      enabled: true,
      releaseRule: releaseRule as object,
    },
  });

  console.info(`[done] 已配置 ${EURO_COMPOSITE_PMI_INSTRUMENT_CODE}`);
  console.info("下一步：npm run data:sync-euro-composite-pmi-te && npm run data:sync-calendar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

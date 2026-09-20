import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import {
  ESTAT_TERMS_URL,
  JP_MOF_CORPORATE_ESTAT_PAGE,
  JP_MOF_CORPORATE_FISCAL_PROVIDER,
  JP_MOF_CORPORATE_FISCAL_SERIES,
  JP_MOF_CORPORATE_PAGE,
  JP_MOF_CORPORATE_SCHEDULE,
  JP_MOF_CORPORATE_SOURCE_ID,
  JP_MOF_DEBT_PAGE,
  JP_MOF_DEBT_SOURCE_ID,
  JP_MOF_DEBT_WORKBOOK_URL,
  JP_MOF_FISCAL_PAGE,
  JP_MOF_FISCAL_RESULTS_URL,
  JP_MOF_FISCAL_SOURCE_ID,
  JP_MOF_TERMS_URL,
} from "../../src/lib/data/scheduler/jpMofCorporateFiscal/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-mof" },
    create: { id: "jp-mof", countryCode: "JP", nameZh: "日本财务省", nameEn: "Ministry of Finance Japan", websiteUrl: "https://www.mof.go.jp/" },
    update: {},
  });
  const sources = [
    [JP_MOF_CORPORATE_SOURCE_ID, "法人企业统计调查（季度）", SourceAdapterKind.REST_API, JP_MOF_CORPORATE_PAGE, ESTAT_TERMS_URL],
    [JP_MOF_FISCAL_SOURCE_ID, "财政统计（决算）", SourceAdapterKind.BULK_FILE, JP_MOF_FISCAL_PAGE, JP_MOF_TERMS_URL],
    [JP_MOF_DEBT_SOURCE_ID, "普通国债余额", SourceAdapterKind.BULK_FILE, JP_MOF_DEBT_PAGE, JP_MOF_TERMS_URL],
  ] as const;
  for (const [id, name, adapterKind, baseUrl, termsUrl] of sources) {
    await prisma.dataSource.upsert({
      where: { id },
      create: { id, agencyId: "jp-mof", name, adapterKind, baseUrl, termsUrl, rateLimit: { minIntervalMs: 2_000 } },
      update: { name, adapterKind, baseUrl, termsUrl },
    });
  }

  for (const series of JP_MOF_CORPORATE_FISCAL_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const sourceUrl = series.dataset === "corporate" ? JP_MOF_CORPORATE_ESTAT_PAGE : series.dataset === "debt" ? JP_MOF_DEBT_WORKBOOK_URL : JP_MOF_FISCAL_RESULTS_URL;
    const isCorporate = series.dataset === "corporate";
    const metadata = {
      ...previous, sourceTag: "jp-mof-corporate-fiscal", countryCode: "JP", countryNameZh: "日本",
      catalogKey: `mds:${series.instrumentCode}`, catalogCategory: series.dataset === "corporate" ? "国民经济" : "财政与公共债务",
      catalogSubcategory: series.dataset === "corporate" ? "企业财务" : series.dataset === "debt" ? "中央政府债务" : "中央政府财政决算",
      displayName: series.label, bootstrapOnly: false, source: "日本财务省", officialUrl: isCorporate ? JP_MOF_CORPORATE_PAGE : series.dataset === "debt" ? JP_MOF_DEBT_PAGE : JP_MOF_FISCAL_PAGE,
      sourceUrl, releaseScheduleUrl: isCorporate ? JP_MOF_CORPORATE_SCHEDULE : undefined, unit: series.unit, freqLabel: series.granularity === "QUARTERLY" ? "季" : "年",
      seasonalAdjustment: "NSA", geography: "日本全国", sourceUpdateNote: isCorporate ? "法人企业统计调查官方 e-Stat 全历史；按指定行业计、全规模法人企业、全产业直接取官方原值并完整回读修订。" : series.dataset === "debt" ? "财务省官方普通国债余额季度表；完整重读滚动工作簿捕获修订。" : "财务省官方一般会计决算历史工作簿；财政年度以该年度4月1日存储，不自行拆为月度。",
      scrape: { provider: JP_MOF_CORPORATE_FISCAL_PROVIDER, url: sourceUrl, script: "scripts/data-worker/sync-jp-mof-corporate-fiscal.ts" },
      fetchAcquisition: { status: "known", probedAt: new Date().toISOString(), method: isCorporate ? "estat_api" : "official_workbook", methodLabel: "scripts/data-worker/sync-jp-mof-corporate-fiscal.ts", fetchUrl: sourceUrl, officialUrl: isCorporate ? JP_MOF_CORPORATE_PAGE : JP_MOF_FISCAL_PAGE },
      attribution: "Source: Ministry of Finance Japan; Chinese labels translated by finance-site.",
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, name: `日本：${series.label}`, shortName: series.label, freqLabel: metadata.freqLabel, unit: series.unit, metadata, externalRefs: { catalogKey: `mds:${series.instrumentCode}`, sourceId: series.sourceId } },
      update: { name: `日本：${series.label}`, shortName: series.label, freqLabel: metadata.freqLabel, unit: series.unit, metadata, externalRefs: { catalogKey: `mds:${series.instrumentCode}`, sourceId: series.sourceId } },
    });
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, sourceId: series.sourceId, sourceSeriesKey: series.instrumentCode, fetchMethod: isCorporate ? DataFetchMethod.API : DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity[series.granularity], timezone: "Asia/Tokyo", releaseRule: { type: "probe_interval", intervalHours: series.granularity === "QUARTERLY" ? 168 : 168 }, revisionLookback: 800, enabled: true, priority: 8, nextRunAt: new Date() },
      update: { sourceId: series.sourceId, sourceSeriesKey: series.instrumentCode, fetchMethod: isCorporate ? DataFetchMethod.API : DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity[series.granularity], timezone: "Asia/Tokyo", releaseRule: { type: "probe_interval", intervalHours: 168 }, revisionLookback: 800, enabled: true, priority: 8 },
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

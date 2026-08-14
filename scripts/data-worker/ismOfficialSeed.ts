import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  type PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  ISM_OFFICIAL_CALENDAR_URL,
  ISM_OFFICIAL_REPORTS_INDEX_URL,
  ISM_OFFICIAL_SOURCE,
  ISM_OFFICIAL_SYNC_SCRIPT,
  ismOfficialReportUrl,
  type IsmOfficialSeriesDef,
} from "../../src/lib/data/scheduler/ismOfficial/catalog";
import {
  computeNextRunAt,
  defaultEconomicCalendarRule,
} from "../../src/lib/data/scheduler/releaseRule";
import { usMetadataCatalogCategory } from "../../src/lib/data/usCatalogTaxonomy";
import { TE_ISM_PAGE_URL } from "../../src/lib/data/scheduler/tradingEconomicsIndicator/ismCatalog";
import { TE_ISM_SVC_PAGE_URL } from "../../src/lib/data/scheduler/tradingEconomicsIndicator/ismSvcCatalog";

export async function upsertIsmOfficialAgencyAndSource(prisma: PrismaClient): Promise<void> {
  await prisma.statisticalAgency.upsert({
    where: { id: ISM_OFFICIAL_SOURCE.agencyId },
    create: {
      id: ISM_OFFICIAL_SOURCE.agencyId,
      countryCode: "US",
      nameZh: ISM_OFFICIAL_SOURCE.nameZh,
      nameEn: ISM_OFFICIAL_SOURCE.nameEn,
      websiteUrl: ISM_OFFICIAL_SOURCE.websiteUrl,
    },
    update: {
      countryCode: "US",
      nameZh: ISM_OFFICIAL_SOURCE.nameZh,
      nameEn: ISM_OFFICIAL_SOURCE.nameEn,
      websiteUrl: ISM_OFFICIAL_SOURCE.websiteUrl,
    },
  });

  await prisma.dataSource.upsert({
    where: { id: ISM_OFFICIAL_SOURCE.id },
    create: {
      id: ISM_OFFICIAL_SOURCE.id,
      agencyId: ISM_OFFICIAL_SOURCE.agencyId,
      name: ISM_OFFICIAL_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ISM_OFFICIAL_SOURCE.baseUrl,
      termsUrl: ISM_OFFICIAL_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: ISM_OFFICIAL_SOURCE.agencyId,
      name: ISM_OFFICIAL_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ISM_OFFICIAL_SOURCE.baseUrl,
      termsUrl: ISM_OFFICIAL_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
  });
}

export async function wireIsmOfficialSeries(
  prisma: PrismaClient,
  series: readonly IsmOfficialSeriesDef[],
): Promise<number> {
  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();
  const catalogCategory = usMetadataCatalogCategory({
    legacyCategory: "采购经理人指数",
    code: "ism_us_ism_headline",
  });

  let wired = 0;
  for (const row of series) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    const prevMd =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const reportUrl = ismOfficialReportUrl(row.kind, "july");
    const teUrl = row.kind === "manufacturing" ? TE_ISM_PAGE_URL : TE_ISM_SVC_PAGE_URL;

    const metadata = mergeFetchAcquisition(
      {
        ...prevMd,
        bootstrapOnly: false,
        source: "ISM",
        sourceUrl: reportUrl,
        officialUrl: ISM_OFFICIAL_REPORTS_INDEX_URL,
        providerNote: "Institute for Supply Management",
        countryCode: "US",
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogCategory,
        catalogKey: `mds:${row.code}`,
        freqLabel: "月",
        unit: "指数",
        sourceUpdateNote:
          "ISM 官网月报 At a Glance 表为主；TE 仅校对与官网失败兜底。发布日以官网年历为准。",
        scrape: {
          provider: "ism_official",
          url: reportUrl,
          calendarUrl: ISM_OFFICIAL_CALENDAR_URL,
          component: row.sector,
          officialLabel: row.officialLabel,
          teFallbackUrl: row.teLabel ? teUrl : undefined,
          teLabel: row.teLabel,
          script: ISM_OFFICIAL_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt,
        method: "ism_official_scrape",
        methodLabel: ISM_OFFICIAL_SYNC_SCRIPT,
        fetchUrl: reportUrl,
        officialUrl: ISM_OFFICIAL_REPORTS_INDEX_URL,
        message: "ISM 官网 PMI 月报 HTML；TE 为备份校对源",
      },
    );

    const instrument = await prisma.instrument.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `美国：${row.displayName}`,
        freqLabel: "月",
        unit: "指数",
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.code}`,
          agencyId: ISM_OFFICIAL_SOURCE.agencyId,
          sourceId: ISM_OFFICIAL_SOURCE.id,
        },
      },
      update: {
        freqLabel: "月",
        unit: existing?.unit?.trim() ? existing.unit : "指数",
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.code}`,
          agencyId: ISM_OFFICIAL_SOURCE.agencyId,
          sourceId: ISM_OFFICIAL_SOURCE.id,
        },
      },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: ISM_OFFICIAL_SOURCE.id,
        sourceSeriesKey: row.code,
        granularity: DataGranularity.MONTHLY,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 50,
        releaseRule: releaseRule as object,
        nextRunAt,
      },
      update: {
        sourceId: ISM_OFFICIAL_SOURCE.id,
        sourceSeriesKey: row.code,
        granularity: DataGranularity.MONTHLY,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: releaseRule as object,
      },
    });

    wired += 1;
    console.info(`[ok] ${row.code} ← ${row.officialLabel}${row.teLabel ? " (TE 备份)" : ""}`);
  }
  return wired;
}

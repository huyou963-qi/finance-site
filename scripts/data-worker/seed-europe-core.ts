import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  ECB_API_BASE,
  ECB_SOURCE_ID,
  EUROPE_CORE_SERIES,
  EUROSTAT_API_BASE,
  EUROSTAT_SOURCE_ID,
  RETIRED_EUROPE_CORE_CODES,
} from "../../src/lib/data/scheduler/europeCore/catalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt, defaultEconomicCalendarRule } from "../../src/lib/data/scheduler/releaseRule";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

function fetchUrlFor(series: (typeof EUROPE_CORE_SERIES)[number]): string {
  if (series.provider === "ecb") {
    return `${ECB_API_BASE}/${series.flow}/${series.seriesKey}?format=csvdata`;
  }
  const params = new URLSearchParams({ lang: "en", ...(series.filters ?? {}) });
  return `${EUROSTAT_API_BASE}/${series.dataset}?${params.toString()}`;
}

async function main() {
  for (const code of RETIRED_EUROPE_CORE_CODES) {
    const retired = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    if (retired) {
      await prisma.instrument.delete({ where: { id: retired.id } });
      console.log(`retire ${code}（旧 HICP 口径临时序列）`);
    }
  }
  // 2026 起 Eurostat 将旧 prc_hicp_midx（截至 2025-12）迁到 ECOICOP v2
  // prc_hicp_minr，并把基期改为 2025=100。若本任务早期 seed 过旧口径，必须物理
  // 重建这些精确仪器，避免同一 code 内把 I15 与 I25 两种指数水平拼成伪时间序列。
  for (const series of EUROPE_CORE_SERIES.filter((row) => row.dataset === "prc_hicp_minr")) {
    const existing = await prisma.instrument.findUnique({
      where: { code: series.instrumentCode },
      select: { id: true, metadata: true },
    });
    const metadata = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    if (existing && metadata.dataset !== "prc_hicp_minr") {
      await prisma.instrument.delete({ where: { id: existing.id } });
      console.log(`reset ${series.instrumentCode}（HICP ECOICOP v2 / 2025=100 口径迁移）`);
    }
  }
  await prisma.statisticalAgency.upsert({
    where: { id: "eu-eurostat" },
    create: {
      id: "eu-eurostat",
      countryCode: "EU",
      nameZh: "欧盟统计局",
      nameEn: "Eurostat",
      websiteUrl: "https://ec.europa.eu/eurostat/",
    },
    update: {},
  });
  await prisma.statisticalAgency.upsert({
    where: { id: "eu-ecb" },
    create: {
      id: "eu-ecb",
      countryCode: "EU",
      nameZh: "欧洲中央银行",
      nameEn: "European Central Bank",
      websiteUrl: "https://www.ecb.europa.eu/",
    },
    update: {},
  });
  await prisma.dataSource.upsert({
    where: { id: EUROSTAT_SOURCE_ID },
    create: {
      id: EUROSTAT_SOURCE_ID,
      agencyId: "eu-eurostat",
      name: "Eurostat Statistics API",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: EUROSTAT_API_BASE,
      termsUrl: "https://ec.europa.eu/eurostat/about-us/policies/copyright",
      rateLimit: { requestsPerMinute: 60, minIntervalMs: 750 },
    },
    update: {
      agencyId: "eu-eurostat",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: EUROSTAT_API_BASE,
      termsUrl: "https://ec.europa.eu/eurostat/about-us/policies/copyright",
      rateLimit: { requestsPerMinute: 60, minIntervalMs: 750 },
    },
  });
  await prisma.dataSource.upsert({
    where: { id: ECB_SOURCE_ID },
    create: {
      id: ECB_SOURCE_ID,
      agencyId: "eu-ecb",
      name: "ECB Data Portal SDMX API",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ECB_API_BASE,
      termsUrl: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
      rateLimit: { requestsPerMinute: 30, minIntervalMs: 1_000 },
    },
    update: {
      agencyId: "eu-ecb",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: ECB_API_BASE,
      termsUrl: "https://www.ecb.europa.eu/services/disclaimer/html/index.en.html",
      rateLimit: { requestsPerMinute: 30, minIntervalMs: 1_000 },
    },
  });

  const probedAt = new Date().toISOString();
  for (const series of EUROPE_CORE_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: series.instrumentCode } });
    const previous = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata as Record<string, unknown>
      : {};
    const sourceName = series.provider === "ecb" ? "欧洲中央银行（ECB）" : "欧盟统计局（Eurostat）";
    const metadata = mergeFetchAcquisition({
      ...previous,
      onboardingStatus: "complete",
      sourceTag: "europe-core-official-api",
      source: sourceName,
      provider: series.provider,
      countryCode: series.countryCode,
      countryNameZh: series.countryNameZh,
      displayName: series.displayName,
      catalogKey: `mds:${series.instrumentCode}`,
      catalogCategory: series.category,
      catalogSubgroup: series.subgroup,
      sourceGeo: series.sourceGeo,
      sourceSeriesCode: series.sourceSeriesKey,
      sourceUrl: series.provider === "ecb" ? ECB_API_BASE : EUROSTAT_API_BASE,
      officialUrl: series.provider === "ecb" ? "https://data.ecb.europa.eu/" : "https://ec.europa.eu/eurostat/databrowser/",
      dataset: series.dataset,
      filters: series.filters,
      flow: series.flow,
      seriesKey: series.seriesKey,
      freqLabel: series.freqLabel,
      unit: series.unit,
      sourceUpdateNote: "官方 API 全历史回填并按发布包持续更新；覆盖源端后续历史修订。",
      dateConvention: "period_start",
      revisionPolicy: "latest-revised; snapshots captured at retrieval time; not historical PIT",
      sourceNotes: series.note,
      bootstrapOnly: false,
    }, {
      status: "known",
      probedAt,
      method: series.provider === "ecb" ? "ecb_sdmx_api" : "eurostat_statistics_api",
      methodLabel: series.provider === "ecb" ? "ECB Data Portal SDMX API" : "Eurostat Statistics API",
      fetchUrl: fetchUrlFor(series),
      officialUrl: series.provider === "ecb" ? "https://data.ecb.europa.eu/" : "https://ec.europa.eu/eurostat/",
      message: "官方公开 API 已核实，无需密钥。",
    });
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: {
        code: series.instrumentCode,
        kind: InstrumentKind.MACRO_SERIES,
        name: series.displayName,
        shortName: series.displayName.replace(/^.+?：/, ""),
        description: series.note,
        freqLabel: series.freqLabel,
        unit: series.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${series.instrumentCode}`,
          sourceId: series.sourceId,
          sourceSeriesKey: series.sourceSeriesKey,
          dataset: series.dataset,
          geo: series.sourceGeo,
        },
      },
      update: {
        name: series.displayName,
        shortName: series.displayName.replace(/^.+?：/, ""),
        description: series.note,
        freqLabel: series.freqLabel,
        unit: series.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${series.instrumentCode}`,
          sourceId: series.sourceId,
          sourceSeriesKey: series.sourceSeriesKey,
          dataset: series.dataset,
          geo: series.sourceGeo,
        },
      },
    });
    const releaseRule = defaultEconomicCalendarRule(series.granularity);
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: series.sourceId,
        sourceSeriesKey: series.sourceSeriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity: series.granularity,
        releaseRule: releaseRule as object,
        nextRunAt: computeNextRunAt(releaseRule, new Date()),
        enabled: true,
        priority: 9,
      },
      update: {
        sourceId: series.sourceId,
        sourceSeriesKey: series.sourceSeriesKey,
        fetchMethod: DataFetchMethod.API,
        granularity: series.granularity,
        releaseRule: releaseRule as object,
        enabled: true,
        priority: 9,
      },
    });
    console.log(`seed ${series.instrumentCode} ${series.freqLabel} ${series.unit}`);
  }
  console.log(`[data:seed-europe-core] 完成：${EUROPE_CORE_SERIES.length} 条官方序列`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());

import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import {
  BOJ_API_BASE,
  BOJ_SOURCE_ID,
  BOJ_TERMS_URL,
} from "../../src/lib/data/scheduler/boj/catalog";
import {
  JP_BOJ_CORE_SERIES,
  JP_BOJ_FOF_NEXT_OFFICIAL_RELEASE_AT,
  JP_BOJ_FOF_NEXT_FETCH_AT,
} from "../../src/lib/data/scheduler/bojCore/catalog";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-boj" },
    create: {
      id: "jp-boj",
      countryCode: "JP",
      nameZh: "日本银行",
      nameEn: "Bank of Japan",
      websiteUrl: "https://www.boj.or.jp/",
    },
    update: {},
  });
  await prisma.dataSource.upsert({
    where: { id: BOJ_SOURCE_ID },
    create: {
      id: BOJ_SOURCE_ID,
      agencyId: "jp-boj",
      name: "BOJ Time-Series API",
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: BOJ_API_BASE,
      termsUrl: BOJ_TERMS_URL,
      rateLimit: { minIntervalMs: 2_000 },
    },
    update: { termsUrl: BOJ_TERMS_URL },
  });

  for (const row of JP_BOJ_CORE_SERIES) {
    const existing = await prisma.instrument.findUnique({
      where: { code: row.instrumentCode },
    });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const fetchUrl = `${BOJ_API_BASE}/getDataCode?format=json&lang=en&db=${row.db}&code=${encodeURIComponent(row.seriesCode)}`;
    const isFlowOfFunds = row.db === "FF";
    const metadata = mergeFetchAcquisition(
      {
        ...previous,
        sourceTag: "jp-boj-core",
        source: "日本银行（BOJ）",
        provider: "boj-time-series",
        countryCode: "JP",
        countryNameZh: "日本",
        displayName: row.displayName,
        catalogKey: `mds:${row.instrumentCode}`,
        catalogCategory: row.category,
        catalogSubgroup: row.subgroup,
        sourceUrl: fetchUrl,
        officialUrl: isFlowOfFunds
          ? "https://www.boj.or.jp/en/statistics/sj/"
          : "https://www.stat-search.boj.or.jp/index_en.html",
        sourceCodesUrl: "https://www.stat-search.boj.or.jp/info/nme_Mdframe_en.html",
        sourceSeriesCode: row.seriesCode,
        sourceDatabase: row.db,
        sourceUnit: row.sourceUnit,
        sourceName: row.sourceName,
        sourceNotes: row.notes,
        freqLabel: row.freqLabel,
        unit: row.unit,
        valueConcept: isFlowOfFunds ? "official stock" : "official monthly average",
        seasonalAdjustment: "not applicable",
        bootstrapOnly: false,
        sourceUpdateNote: isFlowOfFunds
          ? "BOJ季度资金循环全历史API；每次完整回读以捕获季度初值、后续修订及年度追溯修订。"
          : "BOJ金融市场月度全历史API；每24小时探测并完整回读以捕获修订。",
        dateConvention: "period_start",
        revisionPolicy:
          "latest-revised; snapshots captured at retrieval time; not historical first-release PIT",
        methodologyBreak: isFlowOfFunds ? "2004Q4/2005Q1 (1993SNA to 2008SNA)" : undefined,
        apiServiceReleaseNotificationRequired: true,
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "rest_api",
        methodLabel: "BOJ Time-Series API",
        fetchUrl,
        officialUrl: "https://www.stat-search.boj.or.jp/index_en.html",
        message: "BOJ API目录元数据、频率、单位、起止期和实时响应已核实",
      },
    );
    const fields = {
      name: row.displayName,
      freqLabel: row.freqLabel,
      unit: row.unit,
      metadata: metadata as object,
      externalRefs: {
        catalogKey: `mds:${row.instrumentCode}`,
        sourceId: BOJ_SOURCE_ID,
        bojSeriesCode: row.seriesCode,
        bojDatabase: row.db,
      },
    };
    const instrument = await prisma.instrument.upsert({
      where: { code: row.instrumentCode },
      create: { code: row.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields },
      update: fields,
    });
    const subscription = {
      sourceId: BOJ_SOURCE_ID,
      sourceSeriesKey: `${row.db}:${row.seriesCode}`,
      fetchMethod: DataFetchMethod.API,
      granularity:
        row.frequency === "QUARTERLY"
          ? DataGranularity.QUARTERLY
          : DataGranularity.MONTHLY,
      releaseRule: {
        type: "probe_interval",
        intervalHours: row.probeIntervalHours,
      } as object,
      enabled: true,
      priority: 8,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        ...subscription,
        nextRunAt: isFlowOfFunds
          ? new Date(JP_BOJ_FOF_NEXT_FETCH_AT)
          : new Date(),
      },
      update: subscription,
    });
    console.log(`seed ${row.instrumentCode} ${row.db}:${row.seriesCode}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Japan BOJ core seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

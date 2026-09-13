import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  InstrumentKind,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { BOJ_API_BASE, BOJ_SOURCE_ID, BOJ_TERMS_URL } from "../../src/lib/data/scheduler/boj/catalog";
import {
  JP_BOJ_BOP_CODES_URL,
  JP_BOJ_BOP_OFFICIAL_URL,
  JP_BOJ_BOP_SERIES,
} from "../../src/lib/data/scheduler/bojExternal/catalog";
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

  for (const row of JP_BOJ_BOP_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const previous =
      existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    const fetchUrl = `${BOJ_API_BASE}/getDataCode?format=json&lang=en&db=${row.db}&code=${row.seriesCode}`;
    const metadata = mergeFetchAcquisition(
      {
        ...previous,
        sourceTag: "jp-boj-bop",
        source: "日本银行（受日本财务省委托编制）",
        provider: "boj-time-series",
        countryCode: "JP",
        countryNameZh: "日本",
        displayName: row.displayName,
        catalogKey: `mds:${row.instrumentCode}`,
        catalogCategory: row.category,
        catalogSubgroup: row.subgroup,
        sourceUrl: fetchUrl,
        officialUrl: JP_BOJ_BOP_OFFICIAL_URL,
        sourceCodesUrl: JP_BOJ_BOP_CODES_URL,
        sourceSeriesCode: row.seriesCode,
        sourceDatabase: row.db,
        sourceUnit: row.sourceUnit,
        sourceName: row.sourceName,
        freqLabel: row.freqLabel,
        unit: row.unit,
        seasonalAdjustment: "NSA",
        accountingBasis: "BPM6 linked history",
        valueConcept: "official net balance",
        bootstrapOnly: false,
        sourceUpdateNote:
          "BOJ/MOF月度BPM6国际收支；初值通常在参考月后约两个月发布，随后有二次初值、年度与季调修订。每次API全历史抓取覆盖官方修订。",
        dateConvention: "period_start",
        revisionPolicy:
          "latest-revised; BOJ links rearranged BPM6 history for 1996-2013 with current data from 2014 onward; snapshots prove retrieval-time visibility, not first-release PIT",
        signConvention:
          "current/capital components: credit minus debit; financial account: net acquisition of assets minus net incurrence of liabilities",
        apiServiceReleaseNotificationRequired: true,
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "rest_api",
        methodLabel: "BOJ Time-Series API",
        fetchUrl,
        officialUrl: JP_BOJ_BOP_OFFICIAL_URL,
        message: "BOJ BP01元数据、频率、单位、起止期与实际数据响应已核实",
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
      granularity: DataGranularity.MONTHLY,
      releaseRule: { type: "probe_interval", intervalHours: 72 } as object,
      enabled: true,
      priority: 8,
    };
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...subscription, nextRunAt: new Date() },
      update: subscription,
    });
    console.log(`seed ${row.instrumentCode} ${row.seriesCode}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Japan BOJ BOP seed failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

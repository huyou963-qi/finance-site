/**
 * Ritter 美股 IPO 月度统计——种子（数据源 + 仪器 + 订阅 + scrape metadata）
 *
 * npm run data:seed-ritter-ipo
 * Agent C 实跑：FRED 对 IPO 零覆盖（已核实），官方 Excel 全量下载抓取（C3 web-scrape-onboarding）
 * 四条分项（首日涨幅/毛家数/净家数/高于中值占比）共享同一份源文件。
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
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import {
  RITTER_IPO_SERIES,
  RITTER_IPO_PAGE_URL,
  RITTER_IPO_XLS_URL,
  RITTER_IPO_SYNC_SCRIPT,
  RITTER_IPO_SOURCE,
} from "../../src/lib/data/scheduler/ritterIpo/catalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/**
 * 源是年度更新的研究数据集（次年 1 月补齐上一年），没有官方发布日历。
 * 用 probe_interval 168 小时（周探测）——比月频源更稀疏即可，不必每天打人家学校服务器。
 */
const RELEASE_RULE = { type: "probe_interval" as const, intervalHours: 168 };

async function main() {
  console.log("[data:seed-ritter-ipo] 机构 + 数据源…");
  await prisma.statisticalAgency.upsert({
    where: { id: RITTER_IPO_SOURCE.agencyId },
    create: {
      id: RITTER_IPO_SOURCE.agencyId,
      countryCode: "US",
      nameZh: RITTER_IPO_SOURCE.nameZh,
      nameEn: RITTER_IPO_SOURCE.nameEn,
      websiteUrl: RITTER_IPO_SOURCE.websiteUrl,
    },
    update: {
      nameZh: RITTER_IPO_SOURCE.nameZh,
      nameEn: RITTER_IPO_SOURCE.nameEn,
      websiteUrl: RITTER_IPO_SOURCE.websiteUrl,
    },
  });
  await prisma.dataSource.upsert({
    where: { id: RITTER_IPO_SOURCE.id },
    create: {
      id: RITTER_IPO_SOURCE.id,
      agencyId: RITTER_IPO_SOURCE.agencyId,
      name: RITTER_IPO_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: RITTER_IPO_SOURCE.baseUrl,
      termsUrl: RITTER_IPO_SOURCE.termsUrl,
      rateLimit: { requestsPerMinute: 6, minIntervalMs: 5000 },
    },
    update: {
      agencyId: RITTER_IPO_SOURCE.agencyId,
      name: RITTER_IPO_SOURCE.name,
      adapterKind: SourceAdapterKind.REST_API,
      baseUrl: RITTER_IPO_SOURCE.baseUrl,
      termsUrl: RITTER_IPO_SOURCE.termsUrl,
    },
  });

  for (const row of RITTER_IPO_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    const latestObs = existing
      ? await prisma.macroObservation.findFirst({
          where: { instrumentId: existing.id },
          orderBy: { obsDate: "desc" },
          select: { obsDate: true },
        })
      : null;
    const prevMd =
      existing?.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    const metadata = mergeFetchAcquisition(
      {
        ...prevMd,
        sourceTag: "ritter-ipo-scrape",
        bootstrapOnly: false,
        source: "Jay Ritter / University of Florida",
        providerNote: RITTER_IPO_SOURCE.nameEn,
        sourceUrl: row.officialUrl,
        officialUrl: row.officialUrl,
        countryCode: row.countryCode,
        countryNameZh: "美国",
        displayName: row.displayName,
        catalogCategory: row.category,
        freqLabel: row.freqLabel,
        unit: row.unit,
        sourceUpdateNote: row.sourceUpdateNote,
        dataLastObsDateIso: latestObs?.obsDate.toISOString().slice(0, 10) ?? undefined,
        scrape: {
          provider: row.provider,
          url: RITTER_IPO_XLS_URL,
          script: RITTER_IPO_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt: new Date().toISOString(),
        method: "ritter_ipo_scrape",
        methodLabel: RITTER_IPO_SYNC_SCRIPT,
        fetchUrl: RITTER_IPO_XLS_URL,
        officialUrl: RITTER_IPO_PAGE_URL,
        message: "Ritter IPOALL.xlsx（IPOALL sheet）Excel 抓取，年度更新",
      },
    );

    const instrument = await prisma.instrument.upsert({
      where: { code: row.instrumentCode },
      create: {
        code: row.instrumentCode,
        kind: InstrumentKind.MACRO_SERIES,
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
        externalRefs: {
          catalogKey: `mds:${row.instrumentCode}`,
          agencyId: RITTER_IPO_SOURCE.agencyId,
          sourceId: RITTER_IPO_SOURCE.id,
        },
      },
      update: {
        name: row.name,
        freqLabel: row.freqLabel,
        unit: row.unit,
        metadata: metadata as object,
      },
    });

    const nextRunAt = computeNextRunAt(RELEASE_RULE, new Date());
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: {
        instrumentId: instrument.id,
        sourceId: RITTER_IPO_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        fetchMethod: DataFetchMethod.API,
        granularity: DataGranularity.MONTHLY,
        releaseRule: RELEASE_RULE,
        nextRunAt,
        enabled: true,
        priority: 8,
      },
      update: {
        sourceId: RITTER_IPO_SOURCE.id,
        sourceSeriesKey: row.instrumentCode,
        granularity: DataGranularity.MONTHLY,
        releaseRule: RELEASE_RULE,
        enabled: true,
        ...(nextRunAt ? { nextRunAt } : {}),
      },
    });

    console.log(`  ✓ ${row.instrumentCode}（${existing ? "updated" : "created"}）`);
  }

  console.log(
    "[data:seed-ritter-ipo] 下一步：npm run data:sync-ritter-ipo（回填）&& npm run data:verify-ritter-ipo -- --db",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

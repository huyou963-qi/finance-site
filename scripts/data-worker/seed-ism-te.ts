/**
 * 配置 ISM 序列的 TE 抓取订阅与 metadata
 *
 * npm run data:seed-ism-te
 */
import { loadEnvConfig } from "@next/env";
import {
  DataFetchMethod,
  DataGranularity,
  PrismaClient,
  SourceAdapterKind,
} from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  computeNextRunAt,
  defaultEconomicCalendarRule,
} from "../../src/lib/data/scheduler/releaseRule";
import {
  ISM_INSTRUMENT_CODES,
  ISM_SECTOR_TO_TE_LABEL,
  ISM_TE_SYNC_SCRIPT,
  TE_ISM_PAGE_URL,
  ismSectorFromInstrumentCode,
} from "../../src/lib/data/scheduler/tradingEconomicsIndicator/ismCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const TE_ISM_SOURCE = {
  id: "te-ism",
  agencyId: "us-te",
  name: "TradingEconomics Web",
  adapterKind: SourceAdapterKind.REST_API,
  baseUrl: TE_ISM_PAGE_URL,
  termsUrl: "https://tradingeconomics.com/terms-of-use",
  rateLimit: { requestsPerMinute: 10, minIntervalMs: 3000 },
} as const;

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: TE_ISM_SOURCE.agencyId },
    create: {
      id: TE_ISM_SOURCE.agencyId,
      countryCode: "US",
      nameZh: "TradingEconomics",
      nameEn: "TradingEconomics",
      websiteUrl: "https://tradingeconomics.com/",
    },
    update: {
      countryCode: "US",
      nameZh: "TradingEconomics",
      nameEn: "TradingEconomics",
      websiteUrl: "https://tradingeconomics.com/",
    },
  });

  await prisma.dataSource.upsert({
    where: { id: TE_ISM_SOURCE.id },
    create: {
      id: TE_ISM_SOURCE.id,
      agencyId: TE_ISM_SOURCE.agencyId,
      name: TE_ISM_SOURCE.name,
      adapterKind: TE_ISM_SOURCE.adapterKind,
      baseUrl: TE_ISM_SOURCE.baseUrl,
      termsUrl: TE_ISM_SOURCE.termsUrl,
      rateLimit: TE_ISM_SOURCE.rateLimit,
    },
    update: {
      agencyId: TE_ISM_SOURCE.agencyId,
      name: TE_ISM_SOURCE.name,
      adapterKind: TE_ISM_SOURCE.adapterKind,
      baseUrl: TE_ISM_SOURCE.baseUrl,
      termsUrl: TE_ISM_SOURCE.termsUrl,
      rateLimit: TE_ISM_SOURCE.rateLimit,
    },
  });

  const releaseRule = defaultEconomicCalendarRule(DataGranularity.MONTHLY);
  const nextRunAt = computeNextRunAt(releaseRule, new Date());
  const probedAt = new Date().toISOString();

  let wired = 0;
  for (const code of ISM_INSTRUMENT_CODES) {
    const inst = await prisma.instrument.findUnique({ where: { code } });
    if (!inst) {
      console.warn(`[skip] 未找到仪器 ${code}，请先 npm run db:import-macro-xlsx -- --preset=ism`);
      continue;
    }

    const sector = ismSectorFromInstrumentCode(code)!;
    const teLabel = ISM_SECTOR_TO_TE_LABEL[sector]!;

    const prevMd =
      inst.metadata && typeof inst.metadata === "object"
        ? (inst.metadata as Record<string, unknown>)
        : {};

    const metadata = mergeFetchAcquisition(
      {
        ...prevMd,
        bootstrapOnly: false,
        source: "TradingEconomics",
        sourceUrl: TE_ISM_PAGE_URL,
        officialUrl: TE_ISM_PAGE_URL,
        providerNote: "TradingEconomics",
        scrape: {
          provider: "tradingeconomics_ism",
          url: TE_ISM_PAGE_URL,
          component: sector,
          teLabel,
          script: ISM_TE_SYNC_SCRIPT,
        },
      },
      {
        status: "known",
        probedAt,
        method: "te_ism_scrape",
        methodLabel: ISM_TE_SYNC_SCRIPT,
        fetchUrl: TE_ISM_PAGE_URL,
        officialUrl: TE_ISM_PAGE_URL,
        message: "TradingEconomics ISM 制造业 PMI 页 HTML 抓取",
      },
    );

    await prisma.instrument.update({
      where: { id: inst.id },
      data: { metadata: metadata as object },
    });

    await prisma.dataSubscription.upsert({
      where: { instrumentId: inst.id },
      create: {
        instrumentId: inst.id,
        sourceId: TE_ISM_SOURCE.id,
        sourceSeriesKey: code,
        granularity: DataGranularity.MONTHLY,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        priority: 50,
        releaseRule: releaseRule as object,
        nextRunAt,
      },
      update: {
        sourceId: TE_ISM_SOURCE.id,
        sourceSeriesKey: code,
        granularity: DataGranularity.MONTHLY,
        fetchMethod: DataFetchMethod.API,
        enabled: true,
        releaseRule: releaseRule as object,
        nextRunAt,
      },
    });

    wired += 1;
    console.info(`[ok] ${code} ← ${teLabel}`);
  }

  console.info(`[done] 已配置 ${wired}/${ISM_INSTRUMENT_CODES.length} 条 ISM TE 订阅`);
  console.info("下一步：npm run data:sync-ism-te && npm run data:sync-calendar");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

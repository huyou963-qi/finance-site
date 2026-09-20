import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { JP_JTA_ACCOMMODATION_PAGE_URL, JP_JTA_INBOUND_CONSUMPTION_PAGE_URL, JP_JTA_RELEASE_CALENDAR_URL, JP_TOURISM_CORE_PROVIDER, JP_TOURISM_CORE_SERIES, JP_TOURISM_CORE_SYNC_SCRIPT } from "../../src/lib/data/scheduler/jpTourismCore/catalog";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const releaseRule = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  await prisma.statisticalAgency.upsert({
    where: { id: "jp-jta" },
    create: { id: "jp-jta", countryCode: "JP", nameZh: "日本观光厅", nameEn: "Japan Tourism Agency", websiteUrl: "https://www.mlit.go.jp/kankocho/" },
    update: { nameZh: "日本观光厅", nameEn: "Japan Tourism Agency", websiteUrl: "https://www.mlit.go.jp/kankocho/" },
  });
  for (const series of JP_TOURISM_CORE_SERIES) {
    const baseUrl = series.instrumentCode === "jta_jp_inbound_travel_spending_total" ? JP_JTA_INBOUND_CONSUMPTION_PAGE_URL : JP_JTA_ACCOMMODATION_PAGE_URL;
    await prisma.dataSource.upsert({
      where: { id: series.sourceId },
      create: { id: series.sourceId, agencyId: "jp-jta", name: series.label, adapterKind: SourceAdapterKind.BULK_FILE, baseUrl, termsUrl: "https://www.mlit.go.jp/kankocho/page08_000218.html", rateLimit: { minIntervalMs: 1_000, requestsPerMinute: 30 }, metadata: { acquisition: "official_jta_public_files", scheduleUrl: JP_JTA_RELEASE_CALENDAR_URL } },
      update: { agencyId: "jp-jta", name: series.label, adapterKind: SourceAdapterKind.BULK_FILE, baseUrl, termsUrl: "https://www.mlit.go.jp/kankocho/page08_000218.html", rateLimit: { minIntervalMs: 1_000, requestsPerMinute: 30 }, metadata: { acquisition: "official_jta_public_files", scheduleUrl: JP_JTA_RELEASE_CALENDAR_URL } },
    });
    const now = new Date();
    const instrument = await prisma.instrument.upsert({
      where: { code: series.instrumentCode },
      create: { code: series.instrumentCode, kind: InstrumentKind.MACRO_SERIES, name: `日本：${series.label}`, shortName: series.label, freqLabel: series.frequency, unit: series.unit, metadata: { countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${series.instrumentCode}`, catalogCategory: series.category, catalogSubcategory: series.subcategory, displayName: series.label, source: "日本观光厅（JTA）", officialUrl: baseUrl, scheduleUrl: JP_JTA_RELEASE_CALENDAR_URL, unit: series.unit, freqLabel: series.frequency, seasonalAdjustment: "NSA", geography: "日本全国", historyStart: series.historyStart, definition: series.instrumentCode === "jta_jp_inbound_travel_spending_total" ? "观光厅根据入境外国人消费动向调查推计的访日外国人旅行消费额总额。" : "观光厅宿泊旅行统计调查的外国人延泊数全国合计。", revisionLifecycle: series.instrumentCode === "jta_jp_inbound_travel_spending_total" ? "季度1次速報、2次速報并在次年年度确报时最终确定；全量回读捕获修订。" : "月度1次速報、2次速報并在次年年度确报时最终确定；全量回读捕获修订。", scrape: { provider: JP_TOURISM_CORE_PROVIDER, script: JP_TOURISM_CORE_SYNC_SCRIPT }, fetchAcquisition: { status: "known", probedAt: now.toISOString(), method: "jta_official_public_files", fetchUrl: baseUrl, officialUrl: baseUrl } }, externalRefs: { catalogKey: `mds:${series.instrumentCode}`, sourceId: series.sourceId, agencyId: "jp-jta" } },
      update: { name: `日本：${series.label}`, shortName: series.label, freqLabel: series.frequency, unit: series.unit },
    });
    await prisma.dataSubscription.upsert({
      where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, sourceId: series.sourceId, sourceSeriesKey: series.instrumentCode, fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: series.frequency === "季" ? DataGranularity.QUARTERLY : DataGranularity.MONTHLY, timezone: "Asia/Tokyo", releaseRule, revisionLookback: series.frequency === "季" ? 12 : 24, enabled: true, priority: 9, nextRunAt: computeNextRunAt(releaseRule, now)! },
      update: { sourceId: series.sourceId, sourceSeriesKey: series.instrumentCode, fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: series.frequency === "季" ? DataGranularity.QUARTERLY : DataGranularity.MONTHLY, timezone: "Asia/Tokyo", releaseRule, revisionLookback: series.frequency === "季" ? 12 : 24, enabled: true, priority: 9 },
    });
    console.log(`seed ${series.instrumentCode}`);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

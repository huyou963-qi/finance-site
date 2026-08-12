import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { mergeFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { fetchSafeExternalHistory } from "../../src/lib/data/scheduler/safeExternal/client";
import { SAFE_DATASETS, SAFE_EXTERNAL_SOURCE, SAFE_EXTERNAL_SYNC_SCRIPT, type SafeDataset } from "../../src/lib/data/scheduler/safeExternal/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
const datasetArg = process.argv.find((arg) => arg.startsWith("--dataset="))?.slice("--dataset=".length);
const requestedDatasets: SafeDataset[] | undefined = datasetArg
  ? datasetArg.split(",").map((key) => key.trim()).filter((key): key is SafeDataset => SAFE_DATASETS.some((dataset) => dataset.key === key))
  : undefined;
if (datasetArg && !requestedDatasets?.length) throw new Error(`未知 SAFE dataset: ${datasetArg}`);
const withObservations = process.argv.includes("--with-observations");
const granularity = (freq: "月" | "季" | "年") => freq === "月" ? DataGranularity.MONTHLY : freq === "季" ? DataGranularity.QUARTERLY : DataGranularity.ANNUAL;
const rule = (freq: "月" | "季" | "年") => freq === "月" ? { type: "calendar_monthly" as const, probeFromDay: 5, probeUntilDay: 28, intervalHours: 24 } : { type: "probe_interval" as const, intervalHours: freq === "季" ? 24 * 7 : 24 * 30 };
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: "cn-safe" }, create: { id: "cn-safe", countryCode: "CN", nameZh: "国家外汇管理局", nameEn: "State Administration of Foreign Exchange", websiteUrl: "https://www.safe.gov.cn/" }, update: { countryCode: "CN", nameZh: "国家外汇管理局", nameEn: "State Administration of Foreign Exchange", websiteUrl: "https://www.safe.gov.cn/" } });
  await prisma.dataSource.upsert({ where: { id: SAFE_EXTERNAL_SOURCE.id }, create: { ...SAFE_EXTERNAL_SOURCE, adapterKind: SourceAdapterKind.REST_API, rateLimit: { requestsPerMinute: 12, minIntervalMs: 5_000 } }, update: { agencyId: "cn-safe", name: SAFE_EXTERNAL_SOURCE.name, adapterKind: SourceAdapterKind.REST_API, baseUrl: SAFE_EXTERNAL_SOURCE.baseUrl, termsUrl: SAFE_EXTERNAL_SOURCE.termsUrl, rateLimit: { requestsPerMinute: 12, minIntervalMs: 5_000 } } });
  const history = await fetchSafeExternalHistory(requestedDatasets ? { datasets: requestedDatasets } : undefined); const probedAt = new Date().toISOString();
  // Series codes are derived from the stable official table identity. If a
  // parser correction changes that identity, leave no obsolete synthetic
  // series behind in the database or the catalog tree.
  const activeCodes = [...history.keys()];
  const stale = await prisma.instrument.findMany({
    where: {
      AND: [
        requestedDatasets?.length
          ? { OR: requestedDatasets.map((dataset) => ({ code: { startsWith: `safe_cn_${dataset}_` } })) }
          : { code: { startsWith: "safe_cn_" } },
        { code: { notIn: activeCodes } },
      ],
    },
    select: { id: true },
  });
  if (stale.length) await prisma.instrument.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
  let observationsUpserted = 0;
  for (const series of history.values()) { const releaseRule = rule(series.freqLabel); const previous = await prisma.instrument.findUnique({ where: { code: series.code }, select: { metadata: true } }); const metadata = mergeFetchAcquisition({ ...(previous?.metadata as Record<string, unknown> ?? {}), sourceTag: "safe-official-statistical-workbook", bootstrapOnly: false, source: "国家外汇管理局", officialUrl: SAFE_EXTERNAL_SOURCE.baseUrl, countryCode: "CN", countryNameZh: "中国", displayName: series.label, catalogCategory: series.category, freqLabel: series.freqLabel, unit: series.unit, sourceUpdateNote: "国家外汇管理局公开时间序列表；仅保存原表披露的原值，不推算同比、环比或非官方累计值。", scrape: { provider: "safe_external", component: series.key, dataset: series.dataset, script: SAFE_EXTERNAL_SYNC_SCRIPT } }, { status: "known", probedAt, method: "safe_official_xlsx_time_series", methodLabel: SAFE_EXTERNAL_SYNC_SCRIPT, fetchUrl: SAFE_EXTERNAL_SOURCE.baseUrl, officialUrl: SAFE_EXTERNAL_SOURCE.baseUrl, message: "国家外汇管理局公开 Excel 时间序列表；月度、季度和年度按官方表头识别。" });
    const item = await prisma.instrument.upsert({ where: { code: series.code }, create: { code: series.code, kind: InstrumentKind.MACRO_SERIES, name: `中国：外汇与国际收支：${series.label}`, shortName: series.label, description: `国家外汇管理局${series.label}`, freqLabel: series.freqLabel, unit: series.unit, metadata: metadata as object, externalRefs: { catalogKey: `mds:${series.code}`, agencyId: "cn-safe", sourceId: SAFE_EXTERNAL_SOURCE.id } }, update: { name: `中国：外汇与国际收支：${series.label}`, shortName: series.label, description: `国家外汇管理局${series.label}`, freqLabel: series.freqLabel, unit: series.unit, metadata: metadata as object } });
    await prisma.dataSubscription.upsert({ where: { instrumentId: item.id }, create: { instrumentId: item.id, sourceId: SAFE_EXTERNAL_SOURCE.id, sourceSeriesKey: series.key, fetchMethod: DataFetchMethod.API, granularity: granularity(series.freqLabel), releaseRule, nextRunAt: computeNextRunAt(releaseRule), enabled: true, priority: 44 }, update: { sourceId: SAFE_EXTERNAL_SOURCE.id, sourceSeriesKey: series.key, fetchMethod: DataFetchMethod.API, granularity: granularity(series.freqLabel), releaseRule, nextRunAt: computeNextRunAt(releaseRule), enabled: true, priority: 44 } });
    if (withObservations) observationsUpserted += (await upsertMacroObservations(prisma, item.id, series.points)).upserted;
  }
  console.log(`[data:seed-safe-external] 完成：dataset=${requestedDatasets?.join(",") ?? "all"}，${history.size} 条外管局官方序列，observationsUpserted=${observationsUpserted}，清理过期解析序列=${stale.length}`);
}
main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());

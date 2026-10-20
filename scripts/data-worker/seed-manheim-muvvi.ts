import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { MANHEIM_MUVVI_CODE, MANHEIM_MUVVI_OFFICIAL_URL, MANHEIM_MUVVI_PACKAGE_ID, MANHEIM_MUVVI_PROVIDER, MANHEIM_MUVVI_RELEASE_CALENDAR_URL, MANHEIM_MUVVI_SOURCE_ID } from "../../src/lib/data/scheduler/manheimMuvvi/catalog";
import { fetchOfficialManheimHistory } from "../../src/lib/data/scheduler/manheimMuvvi/official";
import { parseManheimMuvviWorkbook } from "../../src/lib/data/scheduler/manheimMuvvi/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const rule = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  const filePath = process.env.MANHEIM_MUVVI_FILE?.trim();
  const existingCount = await prisma.macroObservation.count({ where: { instrument: { code: MANHEIM_MUVVI_CODE } } });
  let official: Awaited<ReturnType<typeof fetchOfficialManheimHistory>> | null = null;
  try {
    official = await fetchOfficialManheimHistory();
  } catch (error) {
    console.warn(`[seed-manheim-muvvi] Cox official download unavailable; worker will retry: ${String(error)}`);
  }
  // Wind is an optional one-time bootstrap only if the official source is unavailable.
  const bootstrap = !official && existingCount === 0 && filePath
    ? parseManheimMuvviWorkbook(await readFile(filePath))
    : null;
  await prisma.statisticalAgency.upsert({
    where: { id: "us-cox-automotive" },
    create: { id: "us-cox-automotive", countryCode: "US", nameZh: "考克斯汽车（Manheim）", nameEn: "Cox Automotive / Manheim", websiteUrl: MANHEIM_MUVVI_OFFICIAL_URL },
    update: { nameZh: "考克斯汽车（Manheim）", nameEn: "Cox Automotive / Manheim", websiteUrl: MANHEIM_MUVVI_OFFICIAL_URL },
  });
  const source = {
    agencyId: "us-cox-automotive", name: "Manheim 二手车批发价格指数（Cox 官方月报）",
    adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: MANHEIM_MUVVI_OFFICIAL_URL,
    metadata: { acquisition: "official_monthly_xlsx", releaseCalendarUrl: MANHEIM_MUVVI_RELEASE_CALENDAR_URL },
  };
  await prisma.dataSource.upsert({ where: { id: MANHEIM_MUVVI_SOURCE_ID }, create: { id: MANHEIM_MUVVI_SOURCE_ID, ...source }, update: source });
  const previous = await prisma.instrument.findUnique({ where: { code: MANHEIM_MUVVI_CODE }, select: { metadata: true } });
  const metadata = {
    ...(previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {}),
    sourceTag: "manheim-muvvi-official-xlsx", bootstrapOnly: false,
    source: "Cox Automotive / Manheim official monthly XLSX", countryCode: "US", countryNameZh: "美国",
    catalogKey: `mds:${MANHEIM_MUVVI_CODE}`, catalogCategory: "通胀与价格", catalogSubcategory: "二手车批发价格",
    displayName: "Manheim 二手车批发价格指数", freqLabel: "月", unit: "指数(1997-01=100)",
    seasonalAdjustment: "SA", referencePeriod: "month", geography: "美国", sourceUrl: MANHEIM_MUVVI_OFFICIAL_URL,
    officialUrl: MANHEIM_MUVVI_OFFICIAL_URL, releaseScheduleUrl: MANHEIM_MUVVI_RELEASE_CALENDAR_URL,
    sourceUpdateNote: "Manheim 每月第5个工作日发布正式月度值；worker 每24小时从 Cox 官方正式月报下载 XLSX 并回读修订。月中检查点不入库；Wind 文件仅用于首次历史回填。",
    ...(official ? { dataLastObsDateIso: official.points.at(-1)!.obsDate.toISOString().slice(0, 10) } : {}),
    scrape: { provider: MANHEIM_MUVVI_PROVIDER, script: "scripts/data-worker/sync-manheim-muvvi.ts" },
    fetchAcquisition: { status: "known", probedAt: new Date().toISOString(), method: "official_monthly_xlsx", methodLabel: "scripts/data-worker/sync-manheim-muvvi.ts", officialUrl: MANHEIM_MUVVI_OFFICIAL_URL, fetchUrl: official?.report.workbookUrl, message: "Cox 官方正式月报 XLSX；每24小时探测，排除月中检查点。" },
  };
  const fields = {
    name: "美国：Manheim 二手车批发价格指数", nameEn: "Manheim Used Vehicle Value Index, seasonally adjusted",
    shortName: "Manheim 二手车批发价格指数", description: "Cox Automotive / Manheim official monthly final index, Jan 1997=100",
    freqLabel: "月", unit: "指数(1997-01=100)", metadata,
    externalRefs: { catalogKey: `mds:${MANHEIM_MUVVI_CODE}`, agencyId: "us-cox-automotive", sourceId: MANHEIM_MUVVI_SOURCE_ID },
  };
  const instrument = await prisma.instrument.upsert({ where: { code: MANHEIM_MUVVI_CODE }, create: { code: MANHEIM_MUVVI_CODE, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
  const subscription = {
    sourceId: MANHEIM_MUVVI_SOURCE_ID, sourceSeriesKey: MANHEIM_MUVVI_CODE,
    fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity.MONTHLY, timezone: "America/New_York",
    releaseRule: rule, revisionLookback: 600, enabled: true, priority: 8,
  };
  await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...subscription, nextRunAt: computeNextRunAt(rule, new Date()) }, update: subscription });
  if (bootstrap) await upsertMacroObservations(prisma, instrument.id, bootstrap.points, { vintageSource: "manheim_licensed_wind_file" });
  const count = official ? (await upsertMacroObservations(prisma, instrument.id, official.points, { vintageSource: "manheim_cox_official_xlsx" })).upserted : 0;
  console.log(`[seed-manheim-muvvi] package=${MANHEIM_MUVVI_PACKAGE_ID} enabled=true officialPoints=${official?.points.length ?? 0} upserted=${count}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

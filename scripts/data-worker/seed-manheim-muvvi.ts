import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { DataFetchMethod, DataGranularity, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import { MANHEIM_MUVVI_CODE, MANHEIM_MUVVI_OFFICIAL_URL, MANHEIM_MUVVI_PACKAGE_ID, MANHEIM_MUVVI_PROVIDER, MANHEIM_MUVVI_RELEASE_CALENDAR_URL, MANHEIM_MUVVI_SOURCE_ID } from "../../src/lib/data/scheduler/manheimMuvvi/catalog";
import { parseManheimMuvviWorkbook } from "../../src/lib/data/scheduler/manheimMuvvi/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const rule = { type: "probe_interval" as const, intervalHours: 24 };

async function main() {
  const filePath = process.env.MANHEIM_MUVVI_FILE?.trim();
  const parsed = filePath ? parseManheimMuvviWorkbook(await readFile(filePath)) : null;
  await prisma.statisticalAgency.upsert({
    where: { id: "us-cox-automotive" },
    create: { id: "us-cox-automotive", countryCode: "US", nameZh: "考克斯汽车（Manheim）", nameEn: "Cox Automotive / Manheim", websiteUrl: MANHEIM_MUVVI_OFFICIAL_URL },
    update: { nameZh: "考克斯汽车（Manheim）", nameEn: "Cox Automotive / Manheim", websiteUrl: MANHEIM_MUVVI_OFFICIAL_URL },
  });
  const source = {
    agencyId: "us-cox-automotive", name: "Manheim 二手车批发价格指数（授权 Wind 文件）",
    adapterKind: SourceAdapterKind.BULK_FILE, baseUrl: MANHEIM_MUVVI_OFFICIAL_URL,
    metadata: { acquisition: "licensed_local_wind_xlsx", releaseCalendarUrl: MANHEIM_MUVVI_RELEASE_CALENDAR_URL },
  };
  await prisma.dataSource.upsert({ where: { id: MANHEIM_MUVVI_SOURCE_ID }, create: { id: MANHEIM_MUVVI_SOURCE_ID, ...source }, update: source });
  const previous = await prisma.instrument.findUnique({ where: { code: MANHEIM_MUVVI_CODE }, select: { metadata: true } });
  const metadata = {
    ...(previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {}),
    sourceTag: "manheim-muvvi-licensed-file", bootstrapOnly: false,
    source: "Cox Automotive / Manheim; licensed Wind export", countryCode: "US", countryNameZh: "美国",
    catalogKey: `mds:${MANHEIM_MUVVI_CODE}`, catalogCategory: "通胀与价格", catalogSubcategory: "二手车批发价格",
    displayName: "Manheim 二手车批发价格指数", freqLabel: "月", unit: "指数(1997-01=100)",
    seasonalAdjustment: "SA", referencePeriod: "month", geography: "美国", sourceUrl: MANHEIM_MUVVI_OFFICIAL_URL,
    officialUrl: MANHEIM_MUVVI_OFFICIAL_URL, releaseScheduleUrl: MANHEIM_MUVVI_RELEASE_CALENDAR_URL,
    sourceUpdateNote: "Manheim 每月第5个工作日发布正式月度值；月中检查点不入库。由获授权的 Wind XLSX 文件更新，须在同一路径替换文件；worker 每24小时检查并完整回读修订。",
    ...(parsed ? { dataLastObsDateIso: `${parsed.latestMonth}-01`, sourcePublishedAt: parsed.publishedAt } : {}),
    scrape: { provider: MANHEIM_MUVVI_PROVIDER, script: "scripts/data-worker/sync-manheim-muvvi.ts" },
    fetchAcquisition: { status: parsed ? "known" : "unknown", probedAt: new Date().toISOString(), method: "licensed_local_wind_xlsx", methodLabel: "scripts/data-worker/sync-manheim-muvvi.ts", officialUrl: MANHEIM_MUVVI_OFFICIAL_URL, message: parsed ? "本地授权 Wind XLSX；无官网抓取。" : "部署 MANHEIM_MUVVI_FILE 后启用本地授权文件订阅。" },
  };
  const fields = {
    name: "美国：Manheim 二手车批发价格指数", nameEn: "Manheim Used Vehicle Value Index, seasonally adjusted",
    shortName: "Manheim 二手车批发价格指数", description: "Official monthly final index, Jan 1997=100; licensed Wind export of Cox Automotive / Manheim data",
    freqLabel: "月", unit: "指数(1997-01=100)", metadata,
    externalRefs: { catalogKey: `mds:${MANHEIM_MUVVI_CODE}`, agencyId: "us-cox-automotive", sourceId: MANHEIM_MUVVI_SOURCE_ID },
  };
  const instrument = await prisma.instrument.upsert({ where: { code: MANHEIM_MUVVI_CODE }, create: { code: MANHEIM_MUVVI_CODE, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
  const subscription = {
    sourceId: MANHEIM_MUVVI_SOURCE_ID, sourceSeriesKey: MANHEIM_MUVVI_CODE,
    fetchMethod: DataFetchMethod.BULK_DOWNLOAD, granularity: DataGranularity.MONTHLY, timezone: "America/New_York",
    releaseRule: rule, revisionLookback: 600, enabled: Boolean(parsed), priority: 8,
  };
  await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...subscription, nextRunAt: parsed ? computeNextRunAt(rule, new Date()) : null }, update: subscription });
  const count = parsed ? (await upsertMacroObservations(prisma, instrument.id, parsed.points, { vintageSource: "manheim_licensed_wind_file" })).upserted : 0;
  console.log(`[seed-manheim-muvvi] package=${MANHEIM_MUVVI_PACKAGE_ID} enabled=${Boolean(parsed)} points=${parsed?.points.length ?? 0} upserted=${count}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

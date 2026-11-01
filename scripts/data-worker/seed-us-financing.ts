import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { DataFetchMethod, InstrumentKind, PrismaClient, SourceAdapterKind } from "@prisma/client";
import { CP_FRED_SERIES, CP_OFFICIAL_URL, CP_WEEKLY_PACKAGE, FINANCING_PROBE_HOURS, WITHDRAWN_DAILY_CODES, WITHDRAWN_DAILY_PACKAGES } from "../../src/lib/data/scheduler/usFinancing/catalog";
import { P0_DATA_SOURCE_FRED } from "../../src/lib/data/scheduler/p0SeedCatalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  // Withdraw the previous task draft without deleting any existing historical facts.
  await prisma.$transaction(async (tx) => {
    await tx.dataSubscription.updateMany({ where: { instrument: { code: { in: WITHDRAWN_DAILY_CODES } } },
      data: { enabled: false, nextRunAt: null } });
    const empty = await tx.instrument.findMany({ where: { code: { in: WITHDRAWN_DAILY_CODES },
      macroPoints: { none: {} }, macroPointVintages: { none: {} } }, select: { id: true } });
    await tx.instrument.deleteMany({ where: { id: { in: empty.map((r) => r.id) } } });
    await tx.releasePackage.updateMany({ where: { id: { in: WITHDRAWN_DAILY_PACKAGES } }, data: { enabled: false, nextRunAt: null } });
  });
  await prisma.statisticalAgency.upsert({ where: { id: "us-frb" },
    create: { id: "us-frb", countryCode: "US", nameZh: "美国联邦储备委员会", nameEn: "Federal Reserve Board", websiteUrl: "https://www.federalreserve.gov/" }, update: {} });
  // Technical transport is the canonical FRED source, not a second CP downloader.
  await prisma.statisticalAgency.upsert({ where: { id: P0_DATA_SOURCE_FRED.agencyId },
    create: { id: P0_DATA_SOURCE_FRED.agencyId, countryCode: "US", nameZh: "圣路易斯联储", nameEn: "Federal Reserve Bank of St. Louis", websiteUrl: "https://fred.stlouisfed.org/" }, update: {} });
  await prisma.dataSource.upsert({ where: { id: "fred" },
    create: { ...P0_DATA_SOURCE_FRED, adapterKind: SourceAdapterKind.FRED_API }, update: {} });
  for (const row of CP_FRED_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    const prior = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const metadata = { ...prior, countryCode: "US", countryNameZh: "美国", catalogCategory: "利率与信用市场",
      catalogKey: `fred:${row.fredId}`, displayName: row.displayName, freqLabel: row.freqLabel, unit: row.unit,
      source: "Federal Reserve Board/FRED", sourceUrl: `https://fred.stlouisfed.org/series/${row.fredId}`,
      officialUrl: CP_OFFICIAL_URL, sourceUpdateNote: row.sourceUpdateNote, seasonalAdjustment: "NSA",
      sourceTag: "us-financing-official", fetchAcquisition: { status: "known", method: "fred_api", methodLabel: "FRED API 原始序列", officialUrl: CP_OFFICIAL_URL,
        fetchUrl: `https://api.stlouisfed.org/fred/series/observations?series_id=${row.fredId}`, message: "FRED release 86；沿用标准限速、分页、修订回读和版本 writer" } };
    const instrument = await prisma.instrument.upsert({ where: { code: row.code },
      create: { code: row.code, kind: InstrumentKind.MACRO_SERIES, name: row.name, fredSeriesId: row.fredId, freqLabel: row.freqLabel, unit: row.unit, metadata },
      update: { name: row.name, fredSeriesId: row.fredId, freqLabel: row.freqLabel, unit: row.unit, metadata } });
    const plan = { sourceId: "fred", sourceSeriesKey: row.fredId, fetchMethod: DataFetchMethod.API,
      granularity: row.granularity, releaseRule: { type: "probe_interval", intervalHours: FINANCING_PROBE_HOURS },
      revisionLookback: 24, enabled: true, priority: 10 };
    const previousSub = await prisma.dataSubscription.findUnique({ where: { instrumentId: instrument.id } });
    const previousRule = previousSub?.releaseRule as { intervalHours?: number } | undefined;
    // Convert the earlier 6-hour draft once; preserve the weekly schedule on repeat seeds.
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id },
      create: { instrumentId: instrument.id, ...plan, nextRunAt: new Date() },
      update: { ...plan, ...(previousRule?.intervalHours !== FINANCING_PROBE_HOURS ? { nextRunAt: new Date() } : {}) } });
    console.log(`[seed-us-financing] ${row.code}`);
  }
  const packages = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"),
    "scripts/data-worker/seed-release-packages.ts", `--packages=${CP_WEEKLY_PACKAGE}`],
    { stdio: "inherit", env: process.env });
  if (packages.status !== 0) throw new Error("Financing package seed failed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

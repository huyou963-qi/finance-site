import { loadEnvConfig } from "@next/env";
import { PrismaClient, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { JP_ESTAT_CPI_SERIES, JP_ESTAT_CPI_SOURCE_ID, JP_ESTAT_CPI_URL } from "../../src/lib/data/scheduler/eStat/cpiCatalog";
import { PHASE5_DATA_SOURCES } from "../../src/lib/data/scheduler/phase5SeedCatalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const { id, ...source } = PHASE5_DATA_SOURCES["estat-jp"];
  await prisma.dataSource.upsert({ where: { id }, create: { id, ...source }, update: { name: source.name, baseUrl: source.baseUrl, termsUrl: source.termsUrl, rateLimit: source.rateLimit, metadata: source.metadata } });
  for (const s of JP_ESTAT_CPI_SERIES) {
    const previous = await prisma.instrument.findUnique({ where: { code: s.instrumentCode } });
    const old = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {};
    const metadata = { ...old, countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${s.instrumentCode}`, catalogCategory: s.category, displayName: s.label,
      bootstrapOnly: false, source: "日本总务省统计局 / e-Stat", sourceUrl: JP_ESTAT_CPI_URL, officialUrl: JP_ESTAT_CPI_URL,
      baseYear: 2025, seasonalAdjustment: "NSA", region: s.region, eStat: s.eStat,
      sourceUpdateNote: "月度官方2025基期接续指数；全历史回扫纳入修订，不拼接旧基期，不自行推算同比环比。东京为区部口径，最新月可为速报。实际抓取版本不等于历史首发PIT。",
      fetchAcquisition: { status: "known", method: "estat_api", methodLabel: "e-Stat API", fetchUrl: JP_ESTAT_CPI_URL, officialUrl: JP_ESTAT_CPI_URL },
      attribution: "Source: Statistics Bureau of Japan, Consumer Price Index via e-Stat; Chinese labels translated by finance-site." };
    const fields = { name: `日本：${s.label}`, freqLabel: "月", unit: s.unit, metadata, externalRefs: { catalogKey: `mds:${s.instrumentCode}`, sourceId: JP_ESTAT_CPI_SOURCE_ID, statsDataId: s.eStat.statsDataId } };
    const inst = await prisma.instrument.upsert({ where: { code: s.instrumentCode }, create: { code: s.instrumentCode, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const sub = { sourceId: JP_ESTAT_CPI_SOURCE_ID, sourceSeriesKey: s.eStat.statsDataId, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.MONTHLY, enabled: true, priority: 8,
      releaseRule: { type: "probe_interval", intervalHours: 72 } };
    await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...sub, nextRunAt: new Date() }, update: sub });
    console.log("seed", s.instrumentCode);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

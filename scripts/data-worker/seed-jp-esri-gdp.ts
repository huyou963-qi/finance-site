import { loadEnvConfig } from "@next/env";
import { PrismaClient, SourceAdapterKind, InstrumentKind, DataFetchMethod, DataGranularity } from "@prisma/client";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
import { JP_ESRI_GDP_AGENCY_ID, JP_ESRI_GDP_SOURCE_ID, JP_ESRI_GDP_PROVIDER, JP_ESRI_GDP_MENU_URL, JP_ESRI_GDP_TERMS_URL, JP_ESRI_GDP_SERIES } from "../../src/lib/data/scheduler/jpEsriGdp/catalog";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const rule = { type: "probe_interval" as const, intervalHours: 168 };
async function main() {
  await prisma.statisticalAgency.upsert({ where: { id: JP_ESRI_GDP_AGENCY_ID }, create: { id: JP_ESRI_GDP_AGENCY_ID, countryCode: "JP", nameZh: "日本内阁府经济社会综合研究所", nameEn: "Economic and Social Research Institute, Cabinet Office", websiteUrl: JP_ESRI_GDP_MENU_URL }, update: { websiteUrl: JP_ESRI_GDP_MENU_URL } });
  const source = { agencyId: JP_ESRI_GDP_AGENCY_ID, name: "ESRI 季度国民经济核算官方CSV", adapterKind: SourceAdapterKind.REST_API, baseUrl: JP_ESRI_GDP_MENU_URL, termsUrl: JP_ESRI_GDP_TERMS_URL, rateLimit: { minIntervalMs: 5000, requestsPerMinute: 12 } };
  await prisma.dataSource.upsert({ where: { id: JP_ESRI_GDP_SOURCE_ID }, create: { id: JP_ESRI_GDP_SOURCE_ID, ...source }, update: source });
  for (const row of JP_ESRI_GDP_SERIES) {
    const existing = await prisma.instrument.findUnique({ where: { code: row.code } });
    const prev = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata : {};
    const metadata = { ...prev, countryCode: "JP", countryNameZh: "日本", source: "日本内阁府 ESRI", officialUrl: JP_ESRI_GDP_MENU_URL, sourceUrl: JP_ESRI_GDP_MENU_URL, catalogKey: `mds:${row.code}`, catalogCategory: row.category, catalogSubgroup: row.subgroup, displayName: row.name, freqLabel: "季", unit: row.unit, bootstrapOnly: false,
      seasonalAdjustment: "SA", annualised: row.table.startsWith("gaku"), baseYear: row.table === "gaku-jk" || row.table === "def-qk" ? 2020 : null, periodConvention: "calendar_quarter_start", sourceUpdateNote: "季度初值/二次值及基准修订；每次重读1994年起完整季调历史；版本以实际摄入时刻可见",
      fetchAcquisition: { status: "known", method: "jp_esri_gdp_csv", methodLabel: "scripts/data-worker/sync-jp-esri-gdp.ts", fetchUrl: JP_ESRI_GDP_MENU_URL, officialUrl: JP_ESRI_GDP_MENU_URL },
      scrape: { provider: JP_ESRI_GDP_PROVIDER, url: JP_ESRI_GDP_MENU_URL, table: row.table, component: row.component, script: "scripts/data-worker/sync-jp-esri-gdp.ts" },
      provenance: { sourceType: "official_static_csv", attribution: "日本内阁府 ESRI 国民经济计算（GDP统计）", licenseUrl: JP_ESRI_GDP_TERMS_URL, historicalPit: false, revisionScope: "full_history", rawArchive: ".data/jp-esri-gdp/snapshots" },
    };
    const fields = { name: row.name, unit: row.unit, freqLabel: "季", metadata, externalRefs: { catalogKey: `mds:${row.code}`, sourceId: JP_ESRI_GDP_SOURCE_ID, agencyId: JP_ESRI_GDP_AGENCY_ID } };
    const instrument = await prisma.instrument.upsert({ where: { code: row.code }, create: { code: row.code, kind: InstrumentKind.MACRO_SERIES, ...fields }, update: fields });
    const fieldsSub = { sourceId: JP_ESRI_GDP_SOURCE_ID, sourceSeriesKey: row.code, fetchMethod: DataFetchMethod.API, granularity: DataGranularity.QUARTERLY, enabled: true, revisionLookback: 1200 };
    // Preserve operational calendar state and due date on repeat seed.
    await prisma.dataSubscription.upsert({ where: { instrumentId: instrument.id }, create: { instrumentId: instrument.id, ...fieldsSub, releaseRule: rule, nextRunAt: computeNextRunAt(rule, new Date()), priority: 8 }, update: fieldsSub });
  }
  console.log(`[seed-jp-esri-gdp] ${JP_ESRI_GDP_SERIES.length} instruments/subscriptions seeded`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

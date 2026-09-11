import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JGB_CURRENT, JGB_PAGE, JGB_SERIES, JGB_TERMS } from "../../src/lib/data/scheduler/japanMofJgb/catalog";
import { fetchJgbCurve } from "../../src/lib/data/scheduler/japanMofJgb/client";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const dry = process.argv.includes("--dry-run");
  // Existing 2Y/10Y facts must match the official source before changing their subscription.
  for (const row of JGB_SERIES.filter((r) => r.code.startsWith("jpov_"))) {
    const subscription = await prisma.dataSubscription.findFirst({ where: { instrument: { code: row.code } }, select: { sourceId: true } });
    if (subscription?.sourceId === "japan-mof-jgb") continue;
    const existing = await prisma.macroObservation.findMany({ where: { instrument: { code: row.code } }, select: { obsDate: true, value: true } });
    if (!existing.length) continue;
    const curve = await fetchJgbCurve();
    const official = new Map(curve.get(row.years)!.map((p) => [p.obsDate.getTime(), p.value]));
    let matches = 0;
    for (const p of existing) {
      const value = official.get(p.obsDate.getTime());
      if (value === undefined) throw new Error(`${row.code} date absent from official history`);
      if (Math.abs(value - p.value) > 0.00001) throw new Error(`${row.code} differs from MOF; manual provenance review required`);
      matches++;
    }
    console.log(`${row.code} reuse gate: ${matches} exact matches`);
  }
  if (dry) { console.log(JSON.stringify(JGB_SERIES)); return; }
  await prisma.statisticalAgency.upsert({ where: { id: "jp-mof" }, create: { id: "jp-mof", countryCode: "JP", nameZh: "日本财务省", nameEn: "Ministry of Finance Japan", websiteUrl: "https://www.mof.go.jp" }, update: {} });
  const source = { agencyId: "jp-mof", name: "日本财务省国债收益率", adapterKind: "REST_API" as const, baseUrl: JGB_PAGE, termsUrl: JGB_TERMS, rateLimit: { minIntervalMs: 1200 }, metadata: { license: "PDL 1.0", credit: "Source: Ministry of Finance Japan" } };
  await prisma.dataSource.upsert({ where: { id: "japan-mof-jgb" }, create: { id: "japan-mof-jgb", ...source }, update: source });
  for (const row of JGB_SERIES) {
    const previous = await prisma.instrument.findUnique({ where: { code: row.code } });
    const md = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {};
    const metadata = { ...md, countryCode: "JP", countryNameZh: "日本", catalogKey: `mds:${row.code}`, catalogCategory: "国债收益率曲线", displayName: row.name, source: "日本财务省", officialUrl: JGB_PAGE, sourceUrl: JGB_PAGE, bootstrapOnly: false, unit: "%", freqLabel: "日", sourceUpdateNote: "固定期限、半年复利收益率；下一营业日日本时间09:30公布；24小时探测。", scrape: { provider: "japan_mof_jgb", url: JGB_CURRENT, script: "scripts/data-worker/sync-japan-mof-jgb.ts" }, fetchAcquisition: { status: "known", method: "official_csv", methodLabel: "scripts/data-worker/sync-japan-mof-jgb.ts", fetchUrl: JGB_CURRENT, probedAt: new Date().toISOString() } };
    const fields = { name: row.name, nameEn: `Japan JGB constant maturity yield ${row.years}Y`, unit: "%", freqLabel: "日", metadata, externalRefs: { ...(previous?.externalRefs as object ?? {}), catalogKey: `mds:${row.code}`, sourceId: "japan-mof-jgb" } };
    const inst = await prisma.instrument.upsert({ where: { code: row.code }, create: { code: row.code, kind: "MACRO_SERIES", ...fields }, update: fields });
    const sub = { sourceId: "japan-mof-jgb", sourceSeriesKey: `${row.years}Y`, fetchMethod: "API" as const, granularity: "DAILY" as const, timezone: "Asia/Tokyo", releaseRule: { type: "probe_interval", intervalHours: 24 }, revisionLookback: 700, enabled: true };
    await prisma.dataSubscription.upsert({ where: { instrumentId: inst.id }, create: { instrumentId: inst.id, ...sub, nextRunAt: new Date() }, update: sub });
    console.log(`seed ${row.code}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

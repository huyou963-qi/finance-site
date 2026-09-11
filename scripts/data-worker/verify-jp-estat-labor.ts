import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_ESTAT_LABOR_SERIES, JP_ESTAT_LABOR_PACKAGE_ID, JP_ESTAT_LABOR_HISTORY_START, buildJpEStatLaborMetadata } from "../../src/lib/data/scheduler/eStat/laborCatalog";
import { fetchEStatIncremental, parseEStatObservations } from "../../src/lib/data/scheduler/adapters/eStatAdapter";
loadEnvConfig(process.cwd());
async function main() {
  assert.equal(JP_ESTAT_LABOR_SERIES.length, 12);
  assert.equal(new Set(JP_ESTAT_LABOR_SERIES.map(s => s.instrumentCode)).size, 12);
  for (const s of JP_ESTAT_LABOR_SERIES) {
    assert.equal(Object.keys(s.eStat.filters).length, 5);
    assert.equal(s.eStat.historyStart, JP_ESTAT_LABOR_HISTORY_START);
  }
  const fixtureDir = process.argv.find(a => a.startsWith("--fixture-dir="))?.slice(14);
  if (fixtureDir) for (const s of JP_ESTAT_LABOR_SERIES.filter(s => s.sex === "total" && ["employed", "participation_rate"].includes(s.concept))) {
    const json = JSON.parse(readFileSync(`${fixtureDir}/data-${s.eStat.statsDataId}.json`, "utf8"));
    const points = parseEStatObservations(json, s.eStat);
    assert.equal(points[0]?.obsDate.toISOString().slice(0, 10), JP_ESTAT_LABOR_HISTORY_START);
    assert(points.length >= 100);
    // Missing filters or another sex must fail rather than merge multidimensional rows.
    assert.throws(() => parseEStatObservations(json, { ...s.eStat, filters: { ...s.eStat.filters, cdCat03: "1" } }));
    assert.throws(() => parseEStatObservations(json, { ...s.eStat, expectedUnit: "wrong" }));
    console.log("fixture verified", s.instrumentCode, points.length);
  }
  if (process.argv.includes("--live")) for (const s of JP_ESTAT_LABOR_SERIES) {
    const result = await fetchEStatIncremental(s.eStat.statsDataId, "1950-01-01", buildJpEStatLaborMetadata(s));
    assert(result.points.length >= 100); assert.equal(result.skippedInvalid, 0);
    console.log("live verified", s.instrumentCode, result.points.length, result.points.at(-1));
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const s of JP_ESTAT_LABOR_SERIES) {
      const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: s.instrumentCode } });
      const md = inst.metadata as Record<string, unknown>;
      assert.equal(inst.unit, s.unit); assert.equal(inst.freqLabel, "月");
      assert.equal(md.countryCode, "JP"); assert.equal(md.catalogKey, `mds:${s.instrumentCode}`);
      assert.equal(md.seasonalAdjustment, "NSA"); assert.deepEqual(md.eStat, s.eStat);
      assert.equal((md.fetchAcquisition as { status: string }).status, "known");
      const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: inst.id }, include: { releasePackage: true } });
      assert(sub.enabled); assert(sub.nextRunAt); assert.equal(sub.sourceId, "estat-jp"); assert.equal(sub.sourceSeriesKey, s.eStat.statsDataId);
      assert.equal((sub.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((sub.releaseRule as { intervalHours: number }).intervalHours, 24);
      assert.equal(sub.releasePackage?.id, JP_ESTAT_LABOR_PACKAGE_ID);
      const points = await prisma.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
      assert(points.length >= 100); assert.equal(points[0].obsDate.toISOString().slice(0, 10), JP_ESTAT_LABOR_HISTORY_START);
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 100 * 86400000, "source stale");
      assert(points.every(p => p.value > 0 && p.value < (s.unit === "%" ? 100 : 15000)));
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].obsDate;
        assert.equal(points[i].obsDate.getTime(), Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1), "unexpected monthly gap");
      }
      console.log("verified", s.instrumentCode, points.length, points[0].obsDate.toISOString().slice(0,10), points.at(-1)!.obsDate.toISOString().slice(0,10), points.at(-1)!.value);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Labor verification failed"); process.exitCode = 1; });

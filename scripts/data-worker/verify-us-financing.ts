import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { CP_FRED_SERIES, FINANCING_PROBE_HOURS, WITHDRAWN_DAILY_CODES } from "../../src/lib/data/scheduler/usFinancing/catalog";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";
import { fetchFredIncremental } from "../../src/lib/data/scheduler/adapters/fredAdapter";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const definitionsOnly = process.argv.includes("--definitions-only");
  const liveStart = `${new Date().getUTCFullYear() - 1}-01-01`;
  const rows = [
    ...CP_FRED_SERIES.map((r) => ({ ...r, key: `fred:${r.fredId}`, sourceId: "fred", sourceKey: r.fredId, lookback: 24 })),

  ];
  assert.equal(new Set(rows.map((r) => r.code)).size, 4);
  const prefix = process.argv.find((a) => a.startsWith("--prefix="))?.slice(9) ?? "";
  const selected = rows.filter((r) => r.code.startsWith(prefix));
  assert.ok(selected.length, "No financing codes match --prefix");
  if (process.argv.includes("--live") && selected.some((r) => r.sourceId === "fred") && !process.env.FRED_API_KEY?.trim()) {
    throw new Error("--live CP verification requires the existing free FRED_API_KEY in the server environment");
  }
  for (const row of selected) {
    assert.notEqual(resolveUsCatalogPlacement({ key: row.key }).category, "未分配");
    if (process.argv.includes("--live")) {
      const result = await fetchFredIncremental(row.sourceKey, process.env.FRED_API_KEY!, liveStart, undefined, true, true);
      if (row.sourceId === "fred") {
        assert.ok(result.sourcePublications?.some((p) => p.releaseId === 86), `${row.code}: wrong/missing official CP release identity`);
      }
      assert.ok(result.points.length > 0, `${row.code}: empty live data`);
      assert.ok(result.points.every((p) => Number.isFinite(p.value) && p.value >= 0), `${row.code}: invalid live value`);
      console.log(`[live] ${row.code}: ${result.points.length} observations`);
    }
    if (!process.argv.includes("--db")) continue;
    const instrument = await prisma.instrument.findUnique({ where: { code: row.code }, include: { dataSubscription: true } });
    assert.ok(instrument, `Missing Instrument ${row.code}`);
    assert.equal(instrument.freqLabel, row.freqLabel); assert.equal(instrument.unit, row.unit);
    const sub = instrument.dataSubscription;
    assert.ok(sub?.enabled, `Missing enabled subscription ${row.code}`);
    assert.equal(sub.sourceId, row.sourceId); assert.equal(sub.sourceSeriesKey, row.sourceKey);
    assert.equal(sub.granularity, row.granularity); assert.equal(sub.revisionLookback, row.lookback);
    assert.equal(sub.releasePackageId, row.releasePackageId); assert.ok(sub.nextRunAt);
    assert.deepEqual(sub.releaseRule, { type: "probe_interval", intervalHours: FINANCING_PROBE_HOURS });
    const metadata = instrument.metadata as Record<string, unknown>;
    assert.equal(metadata.countryCode, "US"); assert.ok(metadata.catalogCategory); assert.ok(metadata.displayName);
    assert.equal(metadata.derivation, undefined);
    assert.equal((metadata.fetchAcquisition as Record<string, unknown>)?.status, "known");
    const pkg = await prisma.releasePackage.findUnique({ where: { id: row.releasePackageId } });
    assert.ok(pkg?.enabled); assert.equal(pkg.granularity, row.granularity);
    assert.deepEqual(pkg.releaseTemplate, { type: "probe_interval", intervalHours: FINANCING_PROBE_HOURS });
    const member = await prisma.releasePackageMember.findUnique({ where: { instrumentId: instrument.id } });
    assert.equal(member?.packageId, row.releasePackageId);
    if (!definitionsOnly) {
      const count = await prisma.macroObservation.count({ where: { instrumentId: instrument.id } });
      assert.ok(count > 0, `${row.code}: zero observations (definitions-only is not data acceptance)`);
      const last = await prisma.macroObservation.findFirst({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "desc" } });
      const age = (Date.now() - last!.obsDate.getTime()) / 86400000;
      assert.ok(age <= 21, `${row.code}: stale ${age.toFixed(1)} days`);
      console.log(`[db] ${row.code}: ${count} observations; latest=${last!.obsDate.toISOString().slice(0, 10)}`);
    }
  }
  if (process.argv.includes("--db")) {
    assert.equal(await prisma.dataSubscription.count({ where: { enabled: true, instrument: { code: { in: WITHDRAWN_DAILY_CODES } } } }), 0, "Draft daily subscriptions must be disabled");
  }
  console.log(`[verify-us-financing] ${selected.length} definitions passed${definitionsOnly ? "; definitions only, observations NOT accepted" : ""}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

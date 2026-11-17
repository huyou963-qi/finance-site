import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { US_MONEY_CREDIT_SERIES } from "../../src/lib/data/scheduler/usMoneyCreditCatalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../../src/lib/data/scheduler/releasePackageCatalog";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  for (const r of US_MONEY_CREDIT_SERIES) {
    assert.deepEqual(RELEASE_PACKAGE_CATALOG.filter(p => instrumentMatchesPackageMember({ code: r.code, fredSeriesId: r.fredId }, p.members)).map(p => p.id), [r.releasePackageId]);
    assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${r.fredId}`, label: r.name }), { category: r.category, subgroup: r.group });
    if (!process.argv.includes("--db")) continue;
    const sub = await db.dataSubscription.findFirstOrThrow({ where: { instrument: { code: r.code } }, include: { source: true, instrument: true, releasePackage: true } });
    assert.equal(sub.sourceId, "fred"); assert.equal(sub.sourceSeriesKey, r.fredId);
    assert.equal(sub.enabled, true); assert.equal(sub.granularity, r.granularity);
    assert.equal(sub.instrument.unit, r.unit); assert.equal(sub.releasePackageId, r.releasePackageId);
    const rule = sub.releaseRule as { type?: string; intervalHours?: number };
    assert.equal(rule.type, r.releaseId === 21 ? "economic_calendar" : "probe_interval");
    if (r.releaseId === 22) assert.equal(rule.intervalHours, 24);
    assert.ok(sub.nextRunAt, `${r.fredId}: no nextRunAt`);
    if (process.argv.includes("--sync")) {
      const result = await runDataSubscription(db, sub, { force: true });
      console.log(`[sync] ${r.fredId} ${JSON.stringify(result)}`);
      assert.notEqual(result.status, "failed");
    }
    const observations = await db.macroObservation.findMany({ where: { instrumentId: sub.instrumentId }, orderBy: { obsDate: "asc" }, select: { obsDate: true, value: true } });
    assert.ok(observations.length > 0, `${r.fredId}: empty`);
    assert.equal(observations[0].obsDate.toISOString().slice(0,10), r.start);
    if (process.argv.includes("--live")) {
      const url = new URL("https://api.stlouisfed.org/fred/series/observations");
      url.search = new URLSearchParams({ series_id: r.fredId, api_key: process.env.FRED_API_KEY!, file_type: "json", observation_start: r.start });
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      assert.ok(response.ok, `FRED HTTP ${response.status}`);
      const payload = await response.json() as { observations: { date: string; value: string }[] };
      const expected = payload.observations.filter(o => o.value !== "." && Number.isFinite(Number(o.value)));
      assert.equal(observations.length, expected.length, `${r.fredId}: historical count`);
      observations.forEach((o,i) => {
        assert.equal(o.obsDate.toISOString().slice(0,10), expected[i].date);
        assert.ok(Math.abs(Number(o.value) - Number(expected[i].value)) < 1e-6, `${r.fredId}: value mismatch ${expected[i].date}`);
      });
    }
    console.log(`[verified] ${r.fredId} count=${observations.length} ${r.start}..${observations.at(-1)!.obsDate.toISOString().slice(0,10)}`);
  }
  console.log("[verify-us-money-credit] PASS");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());

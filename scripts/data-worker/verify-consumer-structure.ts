import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { CONSUMER_STRUCTURE_PACKAGE, CONSUMER_STRUCTURE_SERIES, CONSUMER_MONITOR_SELECTED_IDS } from "../../src/lib/data/scheduler/consumerStructureCatalog";
import { RELEASE_PACKAGE_CATALOG, instrumentMatchesPackageMember } from "../../src/lib/data/scheduler/releasePackageCatalog";
import { resolveUsCatalogPlacement } from "../../src/lib/data/usCatalogTaxonomy";
import { fredCatalogBaseKey } from "../../src/lib/data/fredCatalog";
import type { CatalogLayoutDocument } from "../../src/lib/data/catalogLayout";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  assert.equal(new Set(CONSUMER_MONITOR_SELECTED_IDS).size, 22);
  for (const row of CONSUMER_STRUCTURE_SERIES) {
    assert.deepEqual(RELEASE_PACKAGE_CATALOG.filter(p => instrumentMatchesPackageMember({ code: `sched_fred_${row.fredId}`, fredSeriesId: row.fredId }, p.members)).map(p => p.id), [CONSUMER_STRUCTURE_PACKAGE]);
    assert.deepEqual(resolveUsCatalogPlacement({ key: `fred:${row.fredId}` }), { category: "国民经济", subgroup: "消费与国内需求" });
  }
  if (!process.argv.includes("--db")) { console.log("[verify-consumer-structure] definitions PASS"); return; }
  const stored = await db.macroCatalogLayout.findUniqueOrThrow({ where: { id: "default" } });
  const layout = stored.layout as unknown as CatalogLayoutDocument;
  const result = [], values = new Map<string, Map<string, number>>();
  for (const id of CONSUMER_MONITOR_SELECTED_IDS) {
    const inst = await db.instrument.findUniqueOrThrow({ where: { fredSeriesId: id }, include: { dataSubscription: { include: { releasePackage: true } }, releasePackageMembers: true } });
    const sub = inst.dataSubscription!;
    assert.ok(sub?.enabled && sub.nextRunAt && sub.lastSuccessAt, `${id}: inactive or unverified schedule`);
    assert.equal(sub.sourceId, "fred"); assert.equal(sub.sourceSeriesKey, id);
    assert.ok(sub.releasePackage?.enabled && inst.releasePackageMembers.some(m => m.packageId === sub.releasePackageId));
    const paths: string[] = [];
    for (const country of layout.countries) for (const category of country.categories) for (const group of category.subgroups) {
      if (group.itemKeys.some(k => fredCatalogBaseKey(k) === `fred:${id}`)) {
        assert.ok(group.itemKeys.length <= 48);
        const placement = resolveUsCatalogPlacement({ key: `fred:${id}` })!;
        assert.equal(category.name, placement.category); assert.ok(group.name.startsWith(`${placement.subgroup}（`));
        paths.push(`${country.countryCode} > ${category.name} > ${group.name}`);
      }
    }
    assert.equal(paths.length, 1, `${id}: missing/duplicate catalog placement`);
    assert.equal(await db.macroCatalogExcludedKey.count({ where: { catalogKey: `fred:${id}` } }), 0);
    const observations = await db.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
    assert.ok(observations.length > 0);
    if (CONSUMER_STRUCTURE_SERIES.some(r => r.fredId === id)) {
      assert.equal(inst.unit, "十亿美元"); assert.equal(inst.freqLabel, "月"); assert.equal(sub.granularity, "MONTHLY");
      assert.equal(sub.releasePackageId, CONSUMER_STRUCTURE_PACKAGE); assert.ok(sub.revisionLookback >= 1200);
      assert.equal(observations[0].obsDate.toISOString().slice(0, 10), "1959-01-01");
      observations.forEach((o, i) => { const date = new Date(Date.UTC(1959, i, 1)); assert.equal(o.obsDate.toISOString(), date.toISOString()); assert.ok(Number.isFinite(o.value)); });
      assert.ok(await db.macroObservationVintage.count({ where: { instrumentId: inst.id } }) >= observations.length);
      if (process.argv.includes("--live")) {
        const url = new URL("https://api.stlouisfed.org/fred/series/observations");
        url.search = new URLSearchParams({ series_id: id, api_key: process.env.FRED_API_KEY!, file_type: "json", observation_start: "1959-01-01" }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }); assert.ok(response.ok);
        const payload = await response.json() as { observations: { date: string; value: string }[] };
        const source = payload.observations.filter(o => o.value !== "."); assert.equal(source.length, observations.length);
        observations.forEach((o, i) => { assert.equal(o.obsDate.toISOString().slice(0, 10), source[i].date); assert.equal(o.value, Number(source[i].value)); });
      }
      values.set(id, new Map(observations.map(o => [o.obsDate.toISOString().slice(0, 10), o.value])));
    }
    result.push({ id, code: inst.code, name: inst.name, unit: inst.unit, frequency: inst.freqLabel, observations: observations.length,
      start: observations[0].obsDate.toISOString().slice(0, 10), end: observations.at(-1)!.obsDate.toISOString().slice(0, 10),
      path: paths[0], package: sub.releasePackageId, rule: sub.releaseRule, nextRunAt: sub.nextRunAt, lastSuccessAt: sub.lastSuccessAt });
  }
  let compared = 0, maxError = 0;
  for (const [date, total] of values.get("PCE")!) {
    const parts = ["PCEDG", "PCEND", "PCES"].map(id => values.get(id)!.get(date));
    assert.ok(parts.every(v => v !== undefined));
    const error = Math.abs(parts.reduce<number>((a, b) => a + b!, 0) - total);
    assert.ok(error <= 0.21, `${date}: nominal PCE identity error ${error}`);
    maxError = Math.max(maxError, error); compared++;
  }
  await mkdir(".data/consumer-monitor", { recursive: true });
  await writeFile(".data/consumer-monitor/selected-22-verified.json", JSON.stringify({ verifiedAt: new Date().toISOString(), identity: { compared, maxError }, indicators: result }, null, 2));
  console.log(`[verify-consumer-structure] PASS selected=${result.length} nominal-months=${compared} maxError=${maxError}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());

import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { JP_ESRI_GDP_SERIES, JP_ESRI_GDP_SOURCE_ID, JP_ESRI_GDP_PROVIDER } from "../../src/lib/data/scheduler/jpEsriGdp/catalog";
loadEnvConfig(process.cwd());
async function main() {
  assert.equal(new Set(JP_ESRI_GDP_SERIES.map((s) => s.code)).size, JP_ESRI_GDP_SERIES.length);
  if (!process.argv.includes("--db")) { console.log(`[verify-jp-esri-gdp] catalog ${JP_ESRI_GDP_SERIES.length} OK; --db for live DB checks`); return; }
  const prisma = new PrismaClient();
  try {
    for (const row of JP_ESRI_GDP_SERIES) {
      const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: row.code } });
      const md = inst.metadata as Record<string, unknown>;
      assert.equal(md.countryCode, "JP"); assert.equal(md.catalogKey, `mds:${row.code}`); assert.equal(md.catalogCategory, row.category);
      assert.equal((md.scrape as Record<string, unknown>).provider, JP_ESRI_GDP_PROVIDER);
      assert.equal((md.fetchAcquisition as Record<string, unknown>).status, "known");
      const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: inst.id } });
      assert.equal(sub.sourceId, JP_ESRI_GDP_SOURCE_ID); assert.equal(sub.enabled, true); assert.ok(sub.nextRunAt);
      assert.equal(sub.releasePackageId, "jp.esri.gdp"); assert.equal(sub.granularity, "QUARTERLY");
      assert.equal(md.periodConvention, "calendar_quarter_start");
      const observations = await prisma.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
      assert.ok(observations.length >= 100, `${row.code} incomplete history`);
      assert.equal(observations[0].obsDate.toISOString().slice(0, 10), row.table === "kiyo-jk" ? "1994-04-01" : "1994-01-01");
      const latest = observations.at(-1)!;
      assert.equal(latest.obsDate.getUTCDate(), 1);
      assert.ok([0, 3, 6, 9].includes(latest.obsDate.getUTCMonth()));
      assert.ok(latest.obsDate.getTime() <= Date.now(), `${row.code} future quarter`);
      assert.ok(Date.now() - latest.obsDate.getTime() < 240 * 86400000, `${row.code} stale`);
      for (let i = 1; i < observations.length; i++) {
        const expected = new Date(observations[i - 1].obsDate); expected.setUTCMonth(expected.getUTCMonth() + 3);
        assert.equal(observations[i].obsDate.getTime(), expected.getTime(), `${row.code} quarter gap`);
      }
      const vintages = await prisma.macroObservationVintage.count({ where: { instrumentId: inst.id } });
      assert.ok(vintages >= observations.length, `${row.code} missing version capture`);
      console.log(`${row.code}: ${observations.length} observations, ${vintages} vintages; latest=${latest.obsDate.toISOString().slice(0, 10)} ${latest.value}`);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });

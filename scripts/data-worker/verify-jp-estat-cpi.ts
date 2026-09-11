import assert from "node:assert/strict";
import fs from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_ESTAT_CPI_SERIES, JP_ESTAT_CPI_SOURCE_ID } from "../../src/lib/data/scheduler/eStat/cpiCatalog";
loadEnvConfig(process.cwd());
async function main() {
  assert.equal(JP_ESTAT_CPI_SERIES.length, 26);
  assert.equal(new Set(JP_ESTAT_CPI_SERIES.map(s => s.instrumentCode)).size, 26);
  const meta = JSON.parse(fs.readFileSync("scripts/data-worker/fixtures/jp-estat-cpi/meta.json", "utf8")).METADATA_INF;
  const dimensions = meta.CLASS_INF.CLASS_OBJ as { "@id": string; CLASS: { "@code": string }[] }[];
  for (const s of JP_ESTAT_CPI_SERIES) for (const [key, value] of Object.entries(s.eStat.filters)) {
    const id = key.slice(2).toLowerCase();
    assert(dimensions.find(d => d["@id"] === id)?.CLASS.some(c => c["@code"] === value), `unknown ${key} ${value}`);
  }
  console.log("CPI catalog: 26 distinct fully selected official series");
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const s of JP_ESTAT_CPI_SERIES) {
      const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: s.instrumentCode } });
      assert.equal(inst.freqLabel, "月"); assert.equal(inst.unit, s.unit);
      const md = inst.metadata as Record<string, unknown>;
      assert.equal(md.countryCode, "JP"); assert.equal(md.catalogKey, `mds:${s.instrumentCode}`); assert.deepEqual(md.eStat, s.eStat);
      assert.equal((md.fetchAcquisition as { status: string }).status, "known");
      const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: inst.id }, include: { releasePackage: true } });
      assert(sub.enabled); assert(sub.nextRunAt); assert.equal(sub.sourceId, JP_ESTAT_CPI_SOURCE_ID);
      assert.equal(sub.releasePackage?.id, s.releasePackageId);
      const points = await prisma.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
      assert(points.length >= 100, `${s.instrumentCode} insufficient history`);
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 120 * 86400000, "CPI source stale");
      assert(points.every(p => p.value > 0 && p.value < 1000));
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].obsDate;
        assert.equal(points[i].obsDate.getTime(), Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1), `${s.instrumentCode}: monthly gap`);
      }
      console.log("verified", s.instrumentCode, points.length, points[0].obsDate.toISOString().slice(0, 10), points.at(-1)!.obsDate.toISOString().slice(0, 10));
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

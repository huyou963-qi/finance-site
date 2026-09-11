import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_METI_IIP_SERIES, JP_METI_IIP_PROVIDER } from "../../src/lib/data/scheduler/jpMetiIip/catalog";
import { fetchJpMetiIipWorkbook } from "../../src/lib/data/scheduler/jpMetiIip/client";
import { parseJpMetiIipWorkbook } from "../../src/lib/data/scheduler/jpMetiIip/parser";
loadEnvConfig(process.cwd());
async function main() {
  const fixture = process.argv.find(a => a.startsWith("--fixture="))?.slice(10);
  if (fixture || process.argv.includes("--live")) {
    const parsed = parseJpMetiIipWorkbook(await fetchJpMetiIipWorkbook(fixture));
    for (const [code, s] of Object.entries(parsed)) console.log(code, s.points.length, s.points[0], s.points.at(-1));
  }
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const s of JP_METI_IIP_SERIES) {
      const inst = await prisma.instrument.findUniqueOrThrow({ where: { code: s.instrumentCode } });
      const md = inst.metadata as Record<string, unknown>;
      assert.equal(md.countryCode, "JP"); assert.equal(md.catalogKey, `mds:${s.instrumentCode}`);
      assert.equal((md.scrape as { provider: string }).provider, JP_METI_IIP_PROVIDER);
      assert.equal((md.fetchAcquisition as { status: string }).status, "known");
      const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: inst.id }, include: { releasePackage: true } });
      assert(sub.enabled); assert(sub.nextRunAt); assert.equal((sub.releaseRule as { type: string }).type, "probe_interval");
      assert.equal((sub.releaseRule as { intervalHours: number }).intervalHours, 72);
      assert.equal(sub.releasePackage?.id, "jp.meti.iip");
      const points = await prisma.macroObservation.findMany({ where: { instrumentId: inst.id }, orderBy: { obsDate: "asc" } });
      assert(points.length >= 100); assert.equal(points[0].obsDate.toISOString().slice(0, 10), "2018-01-01");
      assert(Date.now() - points.at(-1)!.obsDate.getTime() < 150 * 86400000, "source stale");
      assert(points.every(p => p.value > 0 && p.value < 1000));
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1].obsDate;
        assert.equal(points[i].obsDate.getTime(), Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1));
      }
      console.log("verified", s.instrumentCode, points.length, points.at(-1)!.obsDate.toISOString());
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { JP_TOURISM_CORE_SERIES } from "../../src/lib/data/scheduler/jpTourismCore/catalog";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv.includes("--db")) return;
  const prisma = new PrismaClient();
  try {
    for (const series of JP_TOURISM_CORE_SERIES) {
      const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: series.instrumentCode } });
      const metadata = instrument.metadata as Record<string, unknown>;
      assert.equal(metadata.countryCode, "JP");
      assert.equal(metadata.geography, "日本全国");
      const sub = await prisma.dataSubscription.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
      assert(sub.enabled); assert(sub.nextRunAt);
      const points = await prisma.macroObservation.findMany({ where: { instrumentId: instrument.id }, orderBy: { obsDate: "asc" } });
      assert(points.length >= (series.frequency === "季" ? 22 : 175));
      assert.equal(points[0].obsDate.toISOString().slice(0, 10), series.historyStart);
      assert(points.every((point) => point.value >= 0));
      if (series.instrumentCode === "jta_jp_inbound_travel_spending_total") {
        // JTA did not publish standalone quarterly result summaries through
        // the pandemic interruption.  The resumed official quarterly run is
        // complete from 2022 Q2 onward; do not manufacture those absent rows.
        const resumed = points.filter((point) => point.obsDate >= new Date("2022-04-01T00:00:00Z"));
        for (let index = 1; index < resumed.length; index++) {
          const prior = resumed[index - 1]!.obsDate;
          assert.equal(+resumed[index]!.obsDate, Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 3, 1));
        }
      }
      console.log("verified", series.instrumentCode, points.length, points.at(-1)?.obsDate.toISOString().slice(0, 10));
    }
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { resolveGlobalCatalogPlacement } from "../../src/lib/data/globalCatalogTaxonomy";
import { MANHEIM_MUVVI_CODE, MANHEIM_MUVVI_PACKAGE_ID, MANHEIM_MUVVI_SOURCE_ID } from "../../src/lib/data/scheduler/manheimMuvvi/catalog";
import { parseManheimMuvviWorkbook } from "../../src/lib/data/scheduler/manheimMuvvi/parse";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const filePath = process.env.MANHEIM_MUVVI_FILE?.trim();
  const parsed = filePath ? parseManheimMuvviWorkbook(await readFile(filePath)) : null;
  assert.deepEqual(resolveGlobalCatalogPlacement({ key: `mds:${MANHEIM_MUVVI_CODE}`, label: "Manheim 二手车批发价格指数", countryCode: "US" } as Parameters<typeof resolveGlobalCatalogPlacement>[0]), { category: "通胀与价格", subgroup: "二手车批发价格" });
  if (!process.argv.includes("--db")) return void console.log(`[verify-manheim-muvvi] filePoints=${parsed?.points.length ?? 0} latest=${parsed?.latestMonth ?? "unconfigured"}`);
  const instrument = await prisma.instrument.findUniqueOrThrow({ where: { code: MANHEIM_MUVVI_CODE }, include: { dataSubscription: true, releasePackageMembers: true } });
  const sub = instrument.dataSubscription;
  assert.equal(sub?.sourceId, MANHEIM_MUVVI_SOURCE_ID);
  assert.equal(sub?.releasePackageId, MANHEIM_MUVVI_PACKAGE_ID);
  assert(instrument.releasePackageMembers.some((member) => member.packageId === MANHEIM_MUVVI_PACKAGE_ID));
  assert.equal((instrument.metadata as Record<string, unknown>).catalogSubcategory, "二手车批发价格");
  if (!parsed) {
    assert.equal(sub?.enabled, false, "No licensed file configured: subscription must remain disabled");
    return void console.log("[verify-manheim-muvvi] licensed file not configured; subscription disabled");
  }
  assert.equal(sub?.enabled, true);
  assert.equal((sub?.releaseRule as { type?: string } | null)?.type, "probe_interval");
  assert(sub?.nextRunAt);
  const aggregate = await prisma.macroObservation.aggregate({ where: { instrumentId: instrument.id }, _count: true, _min: { obsDate: true }, _max: { obsDate: true } });
  assert.equal(aggregate._count, parsed.points.length);
  assert.equal(aggregate._min.obsDate?.toISOString().slice(0, 10), "1997-01-01");
  assert.equal(aggregate._max.obsDate?.toISOString().slice(0, 10), `${parsed.latestMonth}-01`);
  const latest = await prisma.macroObservation.findUniqueOrThrow({ where: { instrumentId_obsDate: { instrumentId: instrument.id, obsDate: parsed.points.at(-1)!.obsDate } } });
  assert.equal(latest.value, parsed.points.at(-1)!.value);
  console.log(`[verify-manheim-muvvi] passed count=${aggregate._count} latest=${parsed.latestMonth} value=${latest.value}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

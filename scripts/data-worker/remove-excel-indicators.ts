/**
 * Delete exactly the 22 Excel-era indicators requested for removal, including
 * observations, vintages, subscriptions, fetch runs and saved catalog references.
 *
 * npm run data:remove-excel-indicators -- --dry-run     # inventory only
 * npm run data:remove-excel-indicators                 # delete, idempotently
 */
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  REMOVED_EXCEL_INDICATOR_CODES,
  removeExcelIndicatorReferences,
} from "../../src/lib/data/removedExcelIndicators";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const apply = !process.argv.includes("--dry-run");
const actor = "data:remove-excel-indicators";

async function cleanSavedJson() {
  const layout = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  if (layout) {
    const cleaned = removeExcelIndicatorReferences(layout.layout);
    if (JSON.stringify(cleaned) !== JSON.stringify(layout.layout)) {
      if (apply) await prisma.macroCatalogLayout.update({ where: { id: layout.id }, data: { layout: cleaned as Prisma.InputJsonValue, updatedBy: actor } });
      console.log("  catalog layout: removed indicator keys");
    }
  }
  const system = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (system) {
    const cleaned = removeExcelIndicatorReferences(system.prefs);
    if (JSON.stringify(cleaned) !== JSON.stringify(system.prefs)) {
      if (apply) await prisma.systemMacroChartPrefs.update({ where: { id: system.id }, data: { prefs: cleaned as Prisma.InputJsonValue } });
      console.log("  system chart preferences: removed indicator keys");
    }
  }
  const users = await prisma.userMacroChartPrefs.findMany({ select: { userId: true, prefs: true } });
  let changedUsers = 0;
  for (const user of users) {
    const cleaned = removeExcelIndicatorReferences(user.prefs);
    if (JSON.stringify(cleaned) === JSON.stringify(user.prefs)) continue;
    changedUsers++;
    if (apply) await prisma.userMacroChartPrefs.update({ where: { userId: user.userId }, data: { prefs: cleaned as Prisma.InputJsonValue } });
  }
  console.log(`  user chart preferences: ${changedUsers} changed`);
  const snapshotPath = path.join(process.cwd(), "data", "system-macro-chart-prefs.json");
  const snapshotText = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotText) as unknown;
  const cleanedSnapshot = removeExcelIndicatorReferences(snapshot);
  if (JSON.stringify(cleanedSnapshot) !== JSON.stringify(snapshot)) {
    if (apply) {
      const lineEnding = snapshotText.includes("\r\n") ? "\r\n" : "\n";
      await writeFile(snapshotPath, JSON.stringify(cleanedSnapshot, null, 2).replace(/\n/g, lineEnding) + lineEnding);
    }
    console.log("  tracked system chart snapshot: removed indicator keys");
  }
}

async function main() {
  if (REMOVED_EXCEL_INDICATOR_CODES.length !== 22 || new Set(REMOVED_EXCEL_INDICATOR_CODES).size !== 22) {
    throw new Error("Deletion list must contain exactly 22 distinct codes");
  }
  console.log(`[remove-excel-indicators] ${apply ? "APPLY" : "DRY RUN"}; exact codes=${REMOVED_EXCEL_INDICATOR_CODES.length}`);
  let found = 0;
  let observations = 0;
  let vintages = 0;
  for (const code of REMOVED_EXCEL_INDICATOR_CODES) {
    const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    const count = instrument ? await prisma.macroObservation.count({ where: { instrumentId: instrument.id } }) : 0;
    const vintageCount = instrument ? await prisma.macroObservationVintage.count({ where: { instrumentId: instrument.id } }) : 0;
    if (instrument) found++;
    observations += count;
    vintages += vintageCount;
    console.log(`  ${code}: ${instrument ? "present" : "absent"}, observations=${count}, vintages=${vintageCount}`);
    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      await tx.macroCatalogExcludedKey.upsert({
        where: { catalogKey: `mds:${code}` },
        create: { catalogKey: `mds:${code}`, deletedBy: actor },
        update: {},
      });
      if (!instrument) return;
      await tx.releasePackageMember.deleteMany({ where: { instrumentId: instrument.id } });
      await tx.dataSubscription.deleteMany({ where: { instrumentId: instrument.id } });
      // Instrument cascades to observations, observation vintages and bars.
      await tx.instrument.delete({ where: { id: instrument.id } });
    }, { timeout: 120_000 });
  }
  if (apply) {
    // This package had only the deleted Nikkei series. Keep the shared COMEX package.
    await prisma.releasePackage.deleteMany({ where: { id: "jp.yahoo.nikkei225", members: { none: {} }, subscriptions: { none: {} } } });
    await prisma.dataSchedulerCalendarOverride.deleteMany({ where: { key: "jp.yahoo.nikkei225" } });
  }
  await cleanSavedJson();
  console.log(`[remove-excel-indicators] ${apply ? "deleted" : "would delete"}: instruments=${found}, observations=${observations}, vintages=${vintages}`);
  if (apply) {
    const remaining = await prisma.instrument.count({ where: { code: { in: [...REMOVED_EXCEL_INDICATOR_CODES] } } });
    const tombstones = await prisma.macroCatalogExcludedKey.count({ where: { catalogKey: { in: REMOVED_EXCEL_INDICATOR_CODES.map((code) => `mds:${code}`) } } });
    if (remaining !== 0 || tombstones !== 22) throw new Error(`Postcondition failed: remaining=${remaining}, tombstones=${tombstones}`);
    console.log("[remove-excel-indicators] verified: zero instruments, 22 catalog tombstones");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

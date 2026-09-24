/**
 * Permanently remove legacy h m_<hash> imports and jpov_c22_public_debt_gdp.
 * Includes observations, vintages, subscriptions, catalog references and chart settings.
 * Run with --dry-run to inventory before applying. Safe to rerun during data:apply.
 */
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { instrumentCodeFromSeriesKey } from "../../src/lib/mdsInstrumentCode";
import {
  REMOVED_JAPAN_DEBT_CODE,
  removeLegacyManualIndicatorReferences,
} from "../../src/lib/data/removedLegacyManualIndicators";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const apply = !process.argv.includes("--dry-run");
const actor = "data:remove-legacy-manual-indicators";

async function cleanLegacyHArchive() {
  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'h') AS exists
  `;
  if (!exists) return;
  const tombstones = new Set((await prisma.macroCatalogExcludedKey.findMany({ select: { catalogKey: true } })).map((row) => row.catalogKey));
  const infoTable = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'h' AND table_name = 'Ind_Info') AS exists
  `;
  const info = infoTable[0]?.exists
    ? await prisma.$queryRaw<{ wd_id: string }[]>`SELECT wd_id FROM h."Ind_Info"`
    : [];
  const removedInfo = info.filter((row) => tombstones.has(`mds:${instrumentCodeFromSeriesKey(row.wd_id)}`));
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'h' AND table_name IN ('Data_D', 'Data_M', 'Data_Q', 'Data_Y')
  `;
  const removedColumns = columns.filter((row) =>
    row.column_name.toLowerCase() !== "date" &&
    tombstones.has(`mds:${instrumentCodeFromSeriesKey(row.column_name)}`),
  );
  const categoryTable = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'h' AND table_name = 'Category') AS exists
  `;
  const categories = categoryTable[0]?.exists
    ? await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM h."Category"`
    : [];
  const categoryCount = Number(categories[0]?.count ?? 0n);
  console.log(`  local h archive: indicator rows=${removedInfo.length}/${info.length}, series columns=${removedColumns.length}, category nodes=${categoryCount}`);
  if (!apply || (!removedInfo.length && !removedColumns.length)) return;

  const quoted = (value: string) => `"${value.replace(/"/g, '""')}"`;
  await prisma.$transaction(async (tx) => {
    if (removedInfo.length) {
      await tx.$executeRaw`DELETE FROM h."Ind_Info" WHERE wd_id IN (${Prisma.join(removedInfo.map((row) => row.wd_id))})`;
    }
    for (const table of ["Data_D", "Data_M", "Data_Q", "Data_Y"]) {
      const names = removedColumns.filter((row) => row.table_name === table).map((row) => row.column_name);
      if (names.length) await tx.$executeRawUnsafe(`ALTER TABLE h.${quoted(table)} ${names.map((name) => `DROP COLUMN ${quoted(name)}`).join(", ")}`);
    }
    if (categoryTable[0]?.exists && infoTable[0]?.exists) {
      const [remaining] = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM h."Ind_Info"`;
      if (Number(remaining?.count ?? 0n) === 0) await tx.$executeRaw`DELETE FROM h."Category"`;
    }
  }, { timeout: 120_000 });
}

async function pruneOrphanLegacyCategories() {
  const categories = await prisma.macroCategory.findMany({
    select: { id: true, parentId: true, metadata: true, _count: { select: { instruments: true } } },
  });
  const children = new Map<string, string[]>();
  for (const row of categories) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  }
  const legacy = categories.filter((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    const origin = metadata?.legacyImport as Record<string, unknown> | undefined;
    return origin?.source === "h.Category";
  });
  const removable = new Set<string>();
  const rounds: string[][] = [];
  while (true) {
    const leaves = legacy.filter((row) =>
      !removable.has(row.id) && row._count.instruments === 0 &&
      (children.get(row.id) ?? []).every((id) => removable.has(id)),
    ).map((row) => row.id);
    if (!leaves.length) break;
    rounds.push(leaves);
    for (const id of leaves) removable.add(id);
  }
  console.log(`  orphan legacy category nodes: ${removable.size}`);
  if (apply) for (const leaves of rounds) await prisma.macroCategory.deleteMany({ where: { id: { in: leaves } } });
}

async function cleanSavedJson() {
  const layout = await prisma.macroCatalogLayout.findUnique({ where: { id: "default" } });
  if (layout) {
    const cleaned = removeLegacyManualIndicatorReferences(layout.layout);
    if (JSON.stringify(cleaned) !== JSON.stringify(layout.layout)) {
      if (apply) await prisma.macroCatalogLayout.update({ where: { id: layout.id }, data: { layout: cleaned as Prisma.InputJsonValue, updatedBy: actor } });
      console.log("  catalog layout: removed deleted keys");
    }
  }
  const system = await prisma.systemMacroChartPrefs.findUnique({ where: { id: "default" } });
  if (system) {
    const cleaned = removeLegacyManualIndicatorReferences(system.prefs);
    if (JSON.stringify(cleaned) !== JSON.stringify(system.prefs)) {
      if (apply) await prisma.systemMacroChartPrefs.update({ where: { id: system.id }, data: { prefs: cleaned as Prisma.InputJsonValue } });
      console.log("  system chart preferences: removed deleted keys");
    }
  }
  const users = await prisma.userMacroChartPrefs.findMany({ select: { userId: true, prefs: true } });
  let changedUsers = 0;
  for (const user of users) {
    const cleaned = removeLegacyManualIndicatorReferences(user.prefs);
    if (JSON.stringify(cleaned) === JSON.stringify(user.prefs)) continue;
    changedUsers++;
    if (apply) await prisma.userMacroChartPrefs.update({ where: { userId: user.userId }, data: { prefs: cleaned as Prisma.InputJsonValue } });
  }
  console.log(`  user chart preferences: ${changedUsers} changed`);

  const snapshotPath = path.join(process.cwd(), "data", "system-macro-chart-prefs.json");
  const snapshotText = await readFile(snapshotPath, "utf8");
  const cleanedSnapshot = removeLegacyManualIndicatorReferences(JSON.parse(snapshotText));
  if (JSON.stringify(cleanedSnapshot) !== JSON.stringify(JSON.parse(snapshotText))) {
    if (apply) {
      const lineEnding = snapshotText.includes("\r\n") ? "\r\n" : "\n";
      await writeFile(snapshotPath, JSON.stringify(cleanedSnapshot, null, 2).replace(/\n/g, lineEnding) + lineEnding);
    }
    console.log("  tracked system chart snapshot: removed deleted keys");
  }
}

async function main() {
  const mPrefix = await prisma.instrument.findMany({
    where: { code: { startsWith: "m_" } },
    select: { id: true, code: true, dataSubscription: { select: { sourceId: true } } },
  });
  const legacy = mPrefix.filter((row) => /^m_[0-9a-f]{32}$/.test(row.code));
  for (const row of legacy) {
    if (row.dataSubscription && row.dataSubscription.sourceId !== "legacy-m") {
      throw new Error(`Unexpected m_ instrument; refusing broad deletion: ${row.code}`);
    }
  }
  const japan = await prisma.instrument.findUnique({ where: { code: REMOVED_JAPAN_DEBT_CODE }, select: { id: true, code: true } });
  const targets = [...legacy.map(({ id, code }) => ({ id, code })), ...(japan ? [japan] : [])];
  const ids = targets.map((row) => row.id);
  const observations = ids.length ? await prisma.macroObservation.count({ where: { instrumentId: { in: ids } } }) : 0;
  const vintages = ids.length ? await prisma.macroObservationVintage.count({ where: { instrumentId: { in: ids } } }) : 0;
  const bars = ids.length ? await prisma.bar.count({ where: { instrumentId: { in: ids } } }) : 0;
  const subscriptions = ids.length ? await prisma.dataSubscription.count({ where: { instrumentId: { in: ids } } }) : 0;
  console.log(`[remove-legacy-manual-indicators] ${apply ? "APPLY" : "DRY RUN"}: legacy=${legacy.length}, Japan debt=${japan ? 1 : 0}, observations=${observations}, vintages=${vintages}, bars=${bars}, subscriptions=${subscriptions}`);

  if (apply) {
    for (let offset = 0; offset < targets.length; offset += 40) {
      const batch = targets.slice(offset, offset + 40);
      const batchIds = batch.map((row) => row.id);
      await prisma.$transaction(async (tx) => {
        await tx.macroCatalogExcludedKey.createMany({
          data: batch.map((row) => ({ catalogKey: `mds:${row.code}`, deletedBy: actor })),
          skipDuplicates: true,
        });
        await tx.releasePackageMember.deleteMany({ where: { instrumentId: { in: batchIds } } });
        await tx.dataSubscription.deleteMany({ where: { instrumentId: { in: batchIds } } });
        await tx.instrument.deleteMany({ where: { id: { in: batchIds } } });
      }, { timeout: 120_000 });
    }
    // Keep the legacy source only if an unexpected subscription still uses it.
    await prisma.dataSource.deleteMany({ where: { id: "legacy-m", subscriptions: { none: {} } } });
  }
  await pruneOrphanLegacyCategories();
  await cleanLegacyHArchive();
  await cleanSavedJson();
  if (apply) {
    const remainingLegacy = (await prisma.instrument.findMany({ where: { code: { startsWith: "m_" } }, select: { code: true } })).filter((row) => /^m_[0-9a-f]{32}$/.test(row.code)).length;
    const remainingJapan = await prisma.instrument.count({ where: { code: REMOVED_JAPAN_DEBT_CODE } });
    const remainingSubscriptions = await prisma.dataSubscription.count({ where: { sourceId: "legacy-m" } });
    const tombstones = await prisma.macroCatalogExcludedKey.count({ where: { catalogKey: { in: targets.map((row) => `mds:${row.code}`) } } });
    if (remainingLegacy || remainingJapan || remainingSubscriptions || tombstones !== targets.length) {
      throw new Error(`Postcondition failed: legacy=${remainingLegacy}, Japan=${remainingJapan}, subscriptions=${remainingSubscriptions}, tombstones=${tombstones}/${targets.length}`);
    }
    console.log(`[remove-legacy-manual-indicators] verified: zero instruments/subscriptions; ${tombstones} new or existing tombstones`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

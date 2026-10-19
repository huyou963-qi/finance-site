/** Compatibility backfill. Dry-run by default; --apply requires an explicit backup path.
 * Reuses the canonical taxonomy and MarketEvent writer. Never adds facts, asset tags or sources.
 * Restore only presentation keys, retaining any subsequent factual edits.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { updateMarketEvent } from "../src/lib/data/marketEvents";
import { markerColorFor } from "../src/lib/data/eventTaxonomy";
import { classifyMacroEventSurprise, macroSurpriseMarkerColor } from "../src/lib/data/macroEventSurprise";

const args = process.argv.slice(2);
const option = (name: string) => args.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1);
const record = (p: unknown): Record<string, unknown> => p && typeof p === "object" && !Array.isArray(p) ? p as Record<string, unknown> : {};
type Change = { id: string; updatedAt: string; before: Record<string, unknown>; after: Record<string, unknown> };

async function main() {
  const restore = option("--restore");
  if (restore) {
    const backup = JSON.parse(await readFile(resolve(restore), "utf8")) as { changes: Change[] };
    let restored = 0, conflicts = 0;
    for (const change of backup.changes) {
      const current = await prisma.marketEvent.findUnique({ where: { id: change.id } });
      if (!current) { conflicts++; continue; }
      const payload = { ...record(current.payload) };
      if (["color", "readingLinks"].some(k => JSON.stringify(payload[k]) !== JSON.stringify(change.after[k]))) { conflicts++; continue; }
      for (const key of ["color", "readingLinks"]) {
        if (change.before[key] === undefined) delete payload[key]; else payload[key] = change.before[key];
      }
      if (args.includes("--apply")) await updateMarketEvent(change.id, { payload });
      restored++;
    }
    console.log(JSON.stringify({ mode: args.includes("--apply") ? "restore" : "restore-preview", restored, conflicts })); return;
  }
  const rows = await prisma.marketEvent.findMany({ orderBy: { id: "asc" } });
  const changes: Change[] = [];
  let colors = 0, readingLinks = 0;
  for (const row of rows) {
    const before = record(row.payload), after = { ...before };
    if (typeof before.color !== "string" || !/^#[0-9a-f]{6}$/i.test(before.color)) {
      const surprise = classifyMacroEventSurprise(row.eventType === "macro.release" ? row.payload : null);
      after.color = macroSurpriseMarkerColor(surprise) || markerColorFor(row.eventType, row.importance); colors++;
    }
    if (row.sourceUrl) {
      try {
        const url = new URL(row.sourceUrl);
        if (/(^|\.)wikipedia\.org$/i.test(url.hostname)) {
          const links = Array.isArray(before.readingLinks) ? before.readingLinks : [];
          if (!links.some(l => record(l).url === row.sourceUrl)) {
            after.readingLinks = [...links, { url: row.sourceUrl, title: "背景阅读" }]; readingLinks++;
          }
        }
      } catch { /* Report invalid links separately; do not fabricate replacements. */ }
    }
    if (JSON.stringify(after) !== JSON.stringify(before)) changes.push({ id: row.id, updatedAt: row.updatedAt.toISOString(), before, after });
  }
  const report = { scanned: rows.length, changes: changes.length, colors, readingLinks, mode: args.includes("--apply") ? "apply" : "preview" };
  if (args.includes("--apply")) {
    const backupPath = option("--backup");
    if (!backupPath) throw new Error("--apply requires --backup=/absolute/path.json");
    const path = resolve(backupPath); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ capturedAt: new Date().toISOString(), report, changes }, null, 2), { flag: "wx" });
    let conflicts = 0;
    for (const change of changes) {
      const current = await prisma.marketEvent.findUnique({ where: { id: change.id }, select: { updatedAt: true } });
      if (current?.updatedAt.toISOString() !== change.updatedAt) { conflicts++; continue; }
      await updateMarketEvent(change.id, { payload: change.after });
    }
    console.log(JSON.stringify({ ...report, conflicts, backup: path }));
  } else console.log(JSON.stringify(report));
}
main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }).finally(() => prisma.$disconnect());

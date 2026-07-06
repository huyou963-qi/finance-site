/**
 * Verify every leaf event has a timeline image in catalog or patch.
 * Usage: node scripts/verify-event-image-coverage.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "scripts/data";

function loadCatalogKeys() {
  const catalogTs = fs.readFileSync("src/lib/data/eventTimelineImageCatalog.ts", "utf8");
  const patchTs = fs.readFileSync("src/lib/data/eventTimelineImagePatch.ts", "utf8");
  const keys = new Set();
  for (const text of [catalogTs, patchTs]) {
    for (const m of text.matchAll(/"((?:us-)[^"]+)":/g)) keys.add(m[1]);
  }
  return keys;
}

function loadLeafSeedKeys() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && f.includes("market-events"));
  const keys = new Set();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
    for (const e of j.events ?? []) {
      if (e.eventType === "时代阶段") continue;
      const m = /\[seed:([^\]]+)\]/.exec(e.content ?? "");
      const k = m?.[1] ?? e.seedKey;
      if (k) keys.add(k);
    }
  }
  return [...keys].sort();
}

const catalogKeys = loadCatalogKeys();
const leafKeys = loadLeafSeedKeys();
const missing = leafKeys.filter((k) => !catalogKeys.has(k));

console.log(`Leaf events: ${leafKeys.length}`);
console.log(`Catalog+patch: ${catalogKeys.size}`);
console.log(`Covered: ${leafKeys.length - missing.length}/${leafKeys.length}`);
if (missing.length) {
  console.log("Missing:", missing.join(", "));
  process.exit(1);
}
console.log("All leaf events have images.");

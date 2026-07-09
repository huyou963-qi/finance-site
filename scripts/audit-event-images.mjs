/**
 * Audit timeline event images: Wikipedia thumb availability.
 * Usage: node scripts/audit-event-images.mjs
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = "scripts/data";

function wikiTitleFromUrl(url) {
  if (!url) return null;
  const m = /wikipedia\.org\/wiki\/([^#?]+)/i.exec(url);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}

function seedKeyFromContent(content) {
  const m = /\[seed:([^\]]+)\]/.exec(content ?? "");
  return m?.[1] ?? null;
}

function loadEvents() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && f.includes("market-events"));
  const events = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
    for (const e of j.events ?? []) {
      if (e.eventType === "时代阶段") continue;
      events.push({
        seedKey: e.seedKey ?? seedKeyFromContent(e.content),
        title: e.title,
        sourceUrl: e.sourceUrl ?? null,
        file: f,
      });
    }
  }
  const byKey = new Map();
  for (const e of events) {
    if (e.seedKey && !byKey.has(e.seedKey)) byKey.set(e.seedKey, e);
  }
  return [...byKey.values()].sort((a, b) => a.seedKey.localeCompare(b.seedKey));
}

async function fetchThumb(title) {
  const slug = title.trim().replace(/ /g, "_");
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
  );
  if (!res.ok) return { ok: false, status: res.status };
  const j = await res.json();
  return { ok: true, thumb: j.thumbnail?.source ?? null, title: j.title };
}

const events = loadEvents();
const noUrl = events.filter((e) => !e.sourceUrl);
const withUrl = events.filter((e) => e.sourceUrl);

console.log(`Leaf events: ${events.length}, no sourceUrl: ${noUrl.length}`);

const withUrlResults = [];
for (const e of withUrl) {
  const title = wikiTitleFromUrl(e.sourceUrl);
  const r = title ? await fetchThumb(title) : { ok: false, thumb: null };
  withUrlResults.push({ ...e, wikiTitle: title, ...r });
  await new Promise((r) => setTimeout(r, 80));
}

const thumbOk = withUrlResults.filter((e) => e.thumb);
const thumbMissing = withUrlResults.filter((e) => !e.thumb);

console.log(`With sourceUrl: ${withUrl.length}, wiki thumb: ${thumbOk.length}, missing thumb: ${thumbMissing.length}`);

const out = {
  generatedAt: new Date().toISOString(),
  noSourceUrl: noUrl,
  wikiNoThumb: thumbMissing.map(({ seedKey, title, sourceUrl, wikiTitle, status }) => ({
    seedKey,
    title,
    sourceUrl,
    wikiTitle,
    status,
  })),
};

fs.writeFileSync("scripts/data/event-image-audit.json", JSON.stringify(out, null, 2));
console.log("Wrote scripts/data/event-image-audit.json");

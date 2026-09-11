import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { JP_ESRI_GDP_MENU_URL, JP_ESRI_GDP_TABLES, type EsriTable } from "./catalog";

export function discoverEsriRelease(menu: string): string {
  const links = [...menu.matchAll(/href=["']([^"']+gdemenuja\.html)["']/g)].map((m) => new URL(m[1], JP_ESRI_GDP_MENU_URL).href);
  const release = links.find((url) => /^https:\/\/www\.esri\.cao\.go\.jp\/jp\/sna\/data\/data_list\/sokuhou\/files\/\d{4}\/qe\d{3}_[12]\/gdemenuja\.html$/.test(url));
  if (!release) throw new Error("ESRI latest release link missing");
  return release;
}

export function discoverEsriCsv(releaseHtml: string, releaseUrl: string, table: EsriTable): string {
  const links = [...releaseHtml.matchAll(/href=["']([^"']+\.csv)["']/g)].map((m) => new URL(m[1], releaseUrl));
  const matches = links.filter((u) => u.origin === "https://www.esri.cao.go.jp" && u.pathname.startsWith(new URL("tables/", releaseUrl).pathname) && new RegExp(`/${table}\\d{4}\\.csv$`).test(u.pathname));
  if (matches.length !== 1) throw new Error(`ESRI missing/ambiguous ${table} CSV`);
  return matches[0].href;
}

type Bundle = { texts: Record<EsriTable, string>; releaseUrl: string; fetchedAt: string };
let cache: { at: number; bundle: Bundle } | undefined;
let pending: Promise<Bundle> | undefined;
let lastRequest = 0;
async function download(url: string): Promise<Buffer> {
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - lastRequest))));
  lastRequest = Date.now();
  const response = await fetch(url, { headers: { "User-Agent": "finance-site-data-scheduler/1.0", Accept: "text/csv,text/html,*/*" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`ESRI HTTP ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 2_000_000) throw new Error("ESRI unexpected oversized file");
  return buffer;
}

/** One six-request snapshot per worker batch, shared by all series; 5s spacing, 60s cache.
 * Content-addressed raw files + source manifest retain revisions without fabricating old availableAt.
 */
export async function fetchEsriGdpBundle(fixtureDir?: string): Promise<Bundle> {
  if (fixtureDir) {
    const texts = {} as Record<EsriTable, string>;
    for (const table of JP_ESRI_GDP_TABLES) texts[table] = new TextDecoder("shift_jis", { fatal: true }).decode(await fs.readFile(path.join(fixtureDir, `${table}.csv`)));
    return { texts, releaseUrl: "fixture", fetchedAt: new Date().toISOString() };
  }
  if (cache && Date.now() - cache.at < 60_000) return cache.bundle;
  if (pending) return pending;
  pending = (async () => {
    const fetchedAt = new Date().toISOString();
    const menu = await download(JP_ESRI_GDP_MENU_URL);
    const releaseUrl = discoverEsriRelease(menu.toString("utf8"));
    const release = await download(releaseUrl);
    const texts = {} as Record<EsriTable, string>;
    const archive = path.resolve(process.env.JP_ESRI_GDP_CACHE_DIR || ".data/jp-esri-gdp/snapshots");
    await fs.mkdir(archive, { recursive: true });
    const files: { url: string; sha256: string; file: string }[] = [];
    async function save(buffer: Buffer, url: string, extension: string) {
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const file = `${sha256}.${extension}`;
      await fs.writeFile(path.join(archive, file), buffer, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; });
      files.push({ url, sha256, file });
    }
    await save(menu, JP_ESRI_GDP_MENU_URL, "html");
    await save(release, releaseUrl, "html");
    for (const table of JP_ESRI_GDP_TABLES) {
      const url = discoverEsriCsv(release.toString("utf8"), releaseUrl, table);
      const buffer = await download(url);
      texts[table] = new TextDecoder("shift_jis", { fatal: true }).decode(buffer);
      await save(buffer, url, "csv");
    }
    await fs.writeFile(path.join(archive, `${fetchedAt.replace(/[:.]/g, "-")}.json`), JSON.stringify({ fetchedAt, releaseUrl, files }, null, 2));
    const bundle = { texts, releaseUrl, fetchedAt };
    cache = { at: Date.now(), bundle };
    return bundle;
  })();
  try { return await pending; } finally { pending = undefined; }
}

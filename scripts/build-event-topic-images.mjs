/**
 * 把 scripts/data/event-topic-image-rules.mjs 的维基词条解析为已验证的 Commons 缩略图，
 * 生成 src/lib/data/eventTopicImageCatalog.ts（运行时不再请求维基 API）。
 *
 * Usage:
 *   node scripts/build-event-topic-images.mjs [--events path/to/events.csv]
 *
 * --events：可选，事件导出 CSV（需含 external_id,title 列），用于报告未命中规则的事件。
 */
import fs from "node:fs";
import {
  EVENT_SEED_IMAGE_OVERRIDES,
  EVENT_TOPIC_IMAGE_RULES,
  EVENT_TOPIC_IMAGE_ROTATIONS,
} from "./data/event-topic-image-rules.mjs";

const OUT = "src/lib/data/eventTopicImageCatalog.ts";
const UA = "finance-site-event-images/1.0 (https://hblook.com)";
const BATCH = 40;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 批量取词条主图（跟随重定向），返回 请求标题 → { url, file } */
async function fetchThumbs(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "pageimages");
    url.searchParams.set("piprop", "thumbnail|name");
    url.searchParams.set("pithumbsize", "500");
    url.searchParams.set("titles", chunk.join("|"));
    url.searchParams.set("redirects", "1");
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`wiki api HTTP ${res.status}`);
    const data = await res.json();
    const alias = new Map();
    for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.query?.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const p of Object.values(data.query?.pages ?? {})) {
      if (!p.thumbnail?.source) continue;
      const requested = alias.get(p.title) ?? p.title;
      out.set(requested, { url: normalizeThumbUrl(p.thumbnail.source), file: p.pageimage ?? "" });
      out.set(p.title, { url: normalizeThumbUrl(p.thumbnail.source), file: p.pageimage ?? "" });
    }
    await sleep(300);
  }
  return out;
}

/** 批量取 Commons 文件缩略图，返回 "File:xxx" → { url, file } */
async function fetchFileThumbs(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|mime");
    url.searchParams.set("iiurlwidth", "500");
    url.searchParams.set("titles", chunk.join("|"));
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`commons api HTTP ${res.status}`);
    const data = await res.json();
    const alias = new Map();
    for (const n of data.query?.normalized ?? []) alias.set(n.to, n.from);
    for (const p of Object.values(data.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii?.thumburl || !/jpeg|png|webp/.test(ii.mime ?? "")) continue;
      const requested = alias.get(p.title) ?? p.title;
      out.set(requested, { url: normalizeThumbUrl(ii.thumburl), file: p.title });
    }
    await sleep(1000);
  }
  return out;
}

/** 去掉统计参数并统一到 upload.wikimedia.org（与既有 seed 图库一致） */
function normalizeThumbUrl(u) {
  const url = new URL(u.startsWith("//") ? `https:${u}` : u);
  url.search = "";
  if (url.hostname === "thumb.wikimedia.org") url.hostname = "upload.wikimedia.org";
  return url.toString();
}

async function urlOk(u) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(u, { method: "HEAD", headers: { "User-Agent": UA } });
      if (res.ok) return true;
      if (res.status !== 429) return false;
    } catch {
      /* retry */
    }
    await sleep(1000 * (attempt + 1));
  }
  return false;
}

/** 极简 CSV 解析（支持双引号转义） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const allCandidates = new Set();
for (const [, candidates] of EVENT_TOPIC_IMAGE_RULES) for (const c of candidates) allCandidates.add(c);
for (const list of Object.values(EVENT_TOPIC_IMAGE_ROTATIONS)) for (const c of list) allCandidates.add(c);
for (const list of Object.values(EVENT_SEED_IMAGE_OVERRIDES)) for (const c of list) allCandidates.add(c);

const articleTitles = [...allCandidates].filter((c) => !c.startsWith("File:"));
const fileTitles = [...allCandidates].filter((c) => c.startsWith("File:"));

const thumbs = await fetchThumbs(articleTitles);
const files = await fetchFileThumbs(fileTitles);

const verified = new Map();
async function verifiedThumb(candidate) {
  if (verified.has(candidate)) return verified.get(candidate);
  const hit = candidate.startsWith("File:") ? files.get(candidate) : thumbs.get(candidate);
  // 词条主图若是 SVG（多为机构标志/印章）不采用，需在规则里改用 File: 指定实景照片
  const usable = hit && !/\.svg$/i.test(hit.file);
  const val = usable && (await urlOk(hit.url)) ? hit : null;
  verified.set(candidate, val);
  await sleep(150);
  return val;
}

const rules = [];
const problems = [];
for (const [pattern, articles] of EVENT_TOPIC_IMAGE_RULES) {
  let chosen = null;
  for (const a of articles) {
    if (await verifiedThumb(a)) {
      chosen = a;
      break;
    }
  }
  if (!chosen) {
    problems.push({ pattern, articles });
    continue;
  }
  const rotation = EVENT_TOPIC_IMAGE_ROTATIONS[chosen] ?? [chosen];
  const urls = [];
  for (const a of rotation) {
    const t = await verifiedThumb(a);
    if (t && !urls.includes(t.url)) urls.push(t.url);
  }
  rules.push({ pattern, article: chosen, file: verified.get(chosen).file, urls });
}

const seedOverrides = [];
for (const [seedKey, candidates] of Object.entries(EVENT_SEED_IMAGE_OVERRIDES)) {
  let hit = null;
  for (const c of candidates) {
    hit = await verifiedThumb(c);
    if (hit) break;
  }
  if (hit) seedOverrides.push({ seedKey, url: hit.url, file: hit.file });
  else problems.push({ pattern: `seed:${seedKey}`, articles: candidates });
}

const lines = [
  "/** Auto-generated by scripts/build-event-topic-images.mjs — validated Commons thumbnails */",
  "/** 规则源：scripts/data/event-topic-image-rules.mjs（匹配 `${externalId} ${title}`，首条命中） */",
  "",
  "export const EVENT_TOPIC_IMAGE_RULES: readonly (readonly [RegExp, readonly string[]])[] = [",
];
for (const r of rules) {
  lines.push(`  [/${r.pattern.replace(/\//g, "\\/")}/i, ${JSON.stringify(r.urls)}],`);
}
lines.push("];", "");
lines.push(
  "/** seed 事件的人工配图，优先于 eventTimelineImageCatalog 的自动结果 */",
  "export const EVENT_SEED_IMAGE_OVERRIDES: Record<string, string> = {",
);
for (const o of seedOverrides) lines.push(`  ${JSON.stringify(o.seedKey)}: ${JSON.stringify(o.url)},`);
lines.push("};", "");
fs.writeFileSync(OUT, lines.join("\n"));

console.log(`rules resolved: ${rules.length}/${EVENT_TOPIC_IMAGE_RULES.length}`);
for (const p of problems) console.log(`NO IMAGE  ${p.pattern}  ${JSON.stringify(p.articles)}`);
for (const r of rules) console.log(`ok  ${r.pattern.padEnd(40)} ${r.article}  →  ${r.file}  (${r.urls.length})`);
for (const o of seedOverrides) console.log(`seed  ${o.seedKey.padEnd(40)} →  ${o.file}`);

const evIdx = process.argv.indexOf("--events");
if (evIdx > 0) {
  const events = parseCsv(fs.readFileSync(process.argv[evIdx + 1], "utf8"));
  const compiled = rules.map((r) => [new RegExp(r.pattern, "i"), r]);
  const unmatched = [];
  const usage = new Map();
  for (const e of events) {
    const key = `${e.external_id.replace(/^ai:/, "")} ${e.title}`;
    const hit = compiled.find(([re]) => re.test(key));
    if (!hit) unmatched.push(key);
    else usage.set(hit[1].article, (usage.get(hit[1].article) ?? 0) + 1);
  }
  console.log(`\nevents: ${events.length}, unmatched: ${unmatched.length}`);
  for (const u of unmatched) console.log(`  UNMATCHED ${u}`);
  console.log("\nmost reused:");
  for (const [a, n] of [...usage].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${n}  ${a}`);
}

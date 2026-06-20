/**
 * 合并 14 时代阶段 + 子事件 → v2 时代树 + v1 扁平种子
 *
 * Usage: node scripts/data/build-us-history-timeline.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { US_HISTORY_ERAS, findEraForDate } from "./us-history-era-defs.mjs";
import { US_HISTORY_EVENTS_1776_1893 } from "./us-history-events-1776-1893.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ev(e) {
  return {
    datePrecision: "DATE",
    assets: [],
    macroKeys: [],
    isPublic: true,
    sourceUrl: null,
    countries: ["US"],
    ...e,
  };
}

function eraMarkersBlock(era) {
  return [
    `[seed:${era.seedKey}]`,
    `[era:tag:${era.tag}]`,
    era.cyclePhase ? `[era:phase:${era.cyclePhase}]` : null,
    `[era:collapse:foldable]`,
    `[era:dateFrom:${era.dateFrom}]`,
    `[era:dateTo:${era.dateTo}]`,
  ]
    .filter(Boolean)
    .join("\n");
}

function eraTitleRange(era) {
  const fromY = era.dateFrom.slice(0, 4);
  const toRaw = era.dateTo.trim();
  const toY =
    toRaw === "present" || toRaw === "今"
      ? String(new Date().getUTCFullYear())
      : toRaw.slice(0, 4);
  return `${fromY}—${toY} ${era.title}`;
}

function attachChildMarkers(event, era) {
  const base = event.content.trim();
  const parentLine = `[era:parent:${era.seedKey}]`;
  const tagLine = `[era:tag:${era.tag}]`;
  const seedLine = event.seedKey ? `[seed:${event.seedKey}]` : null;
  let content = base;
  if (seedLine && !content.includes(seedLine)) content = `${content}\n\n${seedLine}`;
  if (!content.includes(parentLine)) content = `${content}\n\n${parentLine}\n${tagLine}`;
  const industries = [...new Set([...(event.industries ?? []), era.tag])];
  return { ...event, content, industries };
}

function flattenEraSeedToV1(v2) {
  const events = [];
  for (const era of v2.eras) {
    const summaryBody = era.eraSummary.trim();
    const eraContent = summaryBody.includes("[seed:")
      ? summaryBody
      : `${summaryBody}\n\n${eraMarkersBlock(era)}`;

    events.push(
      ev({
        seedKey: era.seedKey,
        title: eraTitleRange(era),
        content: eraContent,
        occurredAt: era.dateFrom,
        importance: "CRITICAL",
        eventType: "时代阶段",
        countries: ["US"],
        industries: ["时代阶段", era.tag],
        sourceUrl: era.wikipediaUrl ?? null,
      }),
    );

    for (const child of era.events) {
      events.push(ev(attachChildMarkers(child, era)));
    }
  }
  events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return {
    version: 1,
    description: v2.description ?? "美国历史经济时代时间线（扁平导入）",
    events,
  };
}

function loadJsonEvents(relPath) {
  const abs = path.join(__dirname, relPath);
  if (!fs.existsSync(abs)) return [];
  const raw = JSON.parse(fs.readFileSync(abs, "utf8"));
  return Array.isArray(raw.events) ? raw.events : [];
}

function runSubBuilders() {
  execSync("node build-us-events-1900-1930.mjs", { cwd: __dirname, stdio: "inherit" });
  execSync("node build-us-events-1930-present.mjs", { cwd: __dirname, stdio: "inherit" });
}

function groupEventsByEra(rawEvents) {
  const byEra = new Map(US_HISTORY_ERAS.map((e) => [e.seedKey, []]));
  for (const item of rawEvents) {
    const era = findEraForDate(item.occurredAt);
    const list = byEra.get(era.seedKey) ?? [];
    list.push(ev(item));
    byEra.set(era.seedKey, list);
  }
  return byEra;
}

function buildV2() {
  runSubBuilders();

  const pool = [
    ...US_HISTORY_EVENTS_1776_1893,
    ...loadJsonEvents("market-events-us-1900-1930.json"),
    ...loadJsonEvents("market-events-us-modern-events.json"),
  ];

  const byEra = groupEventsByEra(pool);

  const eras = US_HISTORY_ERAS.map((eraDef, idx) => ({
    ...eraDef,
    defaultExpanded: idx < 3,
    events: (byEra.get(eraDef.seedKey) ?? []).sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    ),
  }));

  return {
    version: 2,
    description: "美国历史经济时代时间线（1776—今）",
    timeline: {
      country: "US",
      anchorStart: "1776-07-04",
      anchorEnd: "present",
    },
    eras,
  };
}

const v2 = buildV2();
const v1 = flattenEraSeedToV1(v2);

const erasPath = path.join(__dirname, "market-events-us-history-eras.json");
const flatPath = path.join(__dirname, "market-events-us-history-timeline.json");

fs.writeFileSync(erasPath, JSON.stringify(v2, null, 2) + "\n", "utf8");
fs.writeFileSync(flatPath, JSON.stringify(v1, null, 2) + "\n", "utf8");

const childCount = v2.eras.reduce((n, e) => n + e.events.length, 0);
console.log(`Wrote v2 ${v2.eras.length} eras, ${childCount} child events → ${erasPath}`);
console.log(`Wrote v1 ${v1.events.length} flat events → ${flatPath}`);

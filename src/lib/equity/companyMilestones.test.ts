import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { DEFAULT_EVENT_VIEW_FILTERS } from "@/lib/chart/eventViewFilters";
import {
  LOCAL_EVENTS_CHANGED, loadLocalCompanyEvents, localCompanyEventMarkers,
  localStorageKey, parseMilestoneIngestJson, saveLocalCompanyEvents,
} from "./companyMilestones";

const draft = (id: string, title = id) => ({ externalId: id, title, content: "真实研究事实", occurredAt: "2026-10-14",
  eventType: "market.anomaly", markerLabel: "触发", importance: "HIGH", scope: "CROSS",
  assets: [], payload: { impact: { summary: "跨资产研究", channels: ["narrative"] } } });
const items = (id: string, title?: string) => parseMilestoneIngestJson({ events: [draft(id, title)] }).milestones;
let storage: Map<string, string>;
let target: EventTarget;
beforeEach(() => {
  storage = new Map();
  target = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  } });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: () => null, removeItem: () => {},
  } });
});
afterEach(() => { for (const key of ["window", "localStorage", "sessionStorage"]) Reflect.deleteProperty(globalThis, key); });

it("unbound files opt into all assets, legacy files stay symbol-local, invalid targets fail", () => {
  const result = parseMilestoneIngestJson({ query: { importTarget: "all-assets" }, events: [draft("global")] });
  assert.equal(result.symbol, null);
  assert.equal(result.importTarget, "all-assets");
  assert.deepEqual(result.errors, []);
  assert.equal(parseMilestoneIngestJson({ events: [] }).importTarget, "symbol");
  assert.equal(parseMilestoneIngestJson({ query: { importTarget: "other" }, events: [] }).errors.length, 1);
});

it("one global import is visible on equities, gold, FX and bonds; users and symbol imports remain isolated", () => {
  saveLocalCompanyEvents("u1", "NVDA", items("global"), "all-assets");
  saveLocalCompanyEvents("u1", "NVDA", items("specific"));
  for (const symbol of ["XAUUSD", "EURUSD=X", "US10Y", "SMH"]) {
    assert.deepEqual(loadLocalCompanyEvents("u1", symbol).map(m => m.externalId), ["global"]);
  }
  assert.equal(loadLocalCompanyEvents("u1", "NVDA").length, 2);
  assert.deepEqual(loadLocalCompanyEvents("u2", "NVDA"), []);
});

it("symbol override wins without duplicating global ID; clearing globals keeps symbol events", () => {
  saveLocalCompanyEvents("u", "NVDA", items("same", "通用"), "all-assets");
  saveLocalCompanyEvents("u", "NVDA", items("same", "标的"));
  assert.deepEqual(loadLocalCompanyEvents("u", "NVDA").map(m => m.title), ["标的"]);
  assert.deepEqual(loadLocalCompanyEvents("u", "XAUUSD").map(m => m.title), ["通用"]);
  saveLocalCompanyEvents("u", "NVDA", [], "all-assets");
  assert.equal(loadLocalCompanyEvents("u", "NVDA").length, 1);
  assert.equal(loadLocalCompanyEvents("u", "XAUUSD").length, 0);
});

it("corrupt symbol storage does not hide global events and writes broadcast immediately", () => {
  let notices = 0;
  target.addEventListener(LOCAL_EVENTS_CHANGED, () => notices++);
  saveLocalCompanyEvents("u", "NVDA", items("global"), "all-assets");
  storage.set(localStorageKey("u", "NVDA"), "invalid json");
  assert.equal(loadLocalCompanyEvents("u", "NVDA").length, 1);
  assert.equal(notices, 1);
});

it("private markers work with unrelated asset filters and disabled remote sources, but honor display filters", () => {
  const filters = { ...DEFAULT_EVENT_VIEW_FILTERS, assets: ["XAUUSD"], countries: ["CN"], includeSec: false, includeMarket: false };
  const marker = localCompanyEventMarkers(items("a"), filters)[0];
  assert.equal(marker.source, "user_local");
  assert.equal(marker.id, "local:a");
  assert.equal(marker.time, Date.parse("2026-10-14T00:00:00Z") / 1000);
  assert.equal(localCompanyEventMarkers(items("a"), { ...filters, markersEnabled: false }).length, 0);
  assert.equal(localCompanyEventMarkers(items("a"), { ...filters, largeSurpriseOnly: true }).length, 0);
  assert.equal(localCompanyEventMarkers(items("a"), { ...filters, typeFamilies: ["company"] }).length, 0);
  assert.equal(localCompanyEventMarkers(items("a"), { ...filters, minImportance: "CRITICAL" }).length, 0);
  assert.equal(localCompanyEventMarkers(items("a"), { ...filters, searchQ: "不存在" }).length, 0);
});

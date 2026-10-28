import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { Instrument, PrismaClient } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateMarketSchema, queryMarketSchema, attachChartSchema, parseChartRouteId } from "./schema";
import { chartReferenceId, chartReferenceMarkdown, insertChartReference } from "./chartReference";

const prisma = { instrument: { findFirst() {}, findMany() {} }, macroObservation: { findMany() {}, aggregate() {} }, macroObservationVintage: { findMany() {} }, systemMacroChartPrefs: { findUnique() {} },
  article: { findFirst() {}, findUnique() {}, updateMany() {} }, articleAsset: { findMany() {}, create() {}, findUnique() {} }, featureAccessPolicy: { findUnique() {} }, $transaction() {}, async $executeRaw() {} };
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma as unknown as PrismaClient;
const market = Promise.all([import("./indicators"), import("./data"), import("./calculate"), import("./charts"), import("./attach"), import("./tools")]);
const wti = { id: "c79277d3-1091-45a9-acab-52e6999bed1d", code: "sched_fred_DCOILWTICO", fredSeriesId: "DCOILWTICO", kind: "MACRO_SERIES", name: "WTI Cushing spot", nameEn: null, shortName: null, description: "EIA spot price", freqLabel: "日", unit: "美元/桶", tickerSymbol: null, metadata: {}, updatedAt: new Date("2026-10-01") } as unknown as Instrument;
const brent = { ...wti, id: "e266276f-a6d1-49ad-9075-daf23b21a548", code: "sched_fred_DCOILBRENTEU", name: "Brent spot", fredSeriesId: "DCOILBRENTEU" };
const principal = { userId: "owner", grantId: "test-grant", scopes: ["articles:read", "articles:write"] };
const articleId = "7e567a23-b701-4d89-b11e-1a4131cc7b45";
const chartId = "builtin-us-oil-diesel-monitor:0";
function fixture(t: TestContext) {
  t.mock.method(prisma.instrument, "findFirst", async ({ where }: { where: { OR: Record<string, unknown>[] } }) => [wti, brent].find(row => where.OR.some(c => c.id === row.id || c.code === row.code || c.fredSeriesId === row.fredSeriesId)) ?? null);
  t.mock.method(prisma.instrument, "findMany", async () => [wti, brent]);
  t.mock.method(prisma.macroObservation, "aggregate", async () => ({ _min: { obsDate: new Date("2026-10-01") }, _max: { obsDate: new Date("2026-10-28") }, _count: 3 }));
  t.mock.method(prisma.macroObservation, "findMany", async ({ where, take }: { where: { instrumentId: string; obsDate: { gte?: Date; lte?: Date; gt?: Date } }; take: number }) => (where.instrumentId === wti.id ? [{ obsDate: new Date("2026-10-14"), value: 70 }, { obsDate: new Date("2026-10-16"), value: 69 }] : [{ obsDate: new Date("2026-10-14"), value: 73 }, { obsDate: new Date("2026-10-15"), value: 75 }, { obsDate: new Date("2026-10-16"), value: 76 }]).filter(p => (!where.obsDate.gte || p.obsDate >= where.obsDate.gte) && (!where.obsDate.lte || p.obsDate <= where.obsDate.lte) && (!where.obsDate.gt || p.obsDate > where.obsDate.gt)).slice(0, take));
  t.mock.method(prisma.macroObservationVintage, "findMany", async () => []);
  t.mock.method(prisma.systemMacroChartPrefs, "findUnique", async () => null);
  t.mock.method(prisma, "$transaction", async (work: unknown) => typeof work === "function" ? work(prisma) : Promise.all(work as Promise<unknown>[]));
}
test("Chinese WTI/Brent aliases preserve stable identities, sources and basis", async t => {
  fixture(t); const [m] = await market;
  for (const query of ["库欣原油", "布伦特现货"]) {
    const found = await m.searchMarketIndicators({ query, category: "energy" });
    assert.ok(found.indicators.some(i => i.indicatorId === (query === "库欣原油" ? wti.id : brent.id)));
    assert.ok(found.indicators.every(i => i.instrumentType === "spot" && i.unit === "USD/bbl" && i.sourceUrl?.startsWith("https://")));
  }
});
test("two-series query marks unmatched dates missing, retains source metadata, and never interpolates", async t => {
  fixture(t); const [, m] = await market;
  const r = await m.queryMarketData({ indicatorIds: [wti.id, brent.id], startDate: "2026-10-01", endDate: "2026-10-28", frequency: "daily" });
  assert.equal(r.series.length, 2);
  assert.deepEqual(r.series[0]!.points.map(p => p.value), [70, null, 69]);
  assert.equal(r.series[0]!.points[1]!.missing, true);
  assert.equal(r.series[0]!.points[0]!.publishedAt, null);
  assert.equal(r.series[0]!.points[0]!.revised, null);
  assert.equal(r.series[0]!.transformations.interpolated, false);
  assert.equal(r.nextCursor, null);
  await assert.rejects(m.queryMarketData({ indicatorIds: [wti.id], startDate: "2026-10-01", endDate: "2026-10-28", frequency: "monthly" }), /原生频率/);
});
test("as-of queries never fall back to current prices; version changes are identifiable", async t => {
  fixture(t); const [, m] = await market;
  const raw = { indicatorIds: [wti.id], startDate: "2026-10-01", endDate: "2026-10-28", dataCutoff: "2026-10-20T00:00:00Z" };
  assert.equal((await m.queryMarketData(raw)).series[0]!.points.length, 0);
  t.mock.method(prisma.macroObservationVintage, "findMany", async () => [
    { obsDate: new Date("2026-10-14"), value: 69, availableAt: new Date("2026-10-15"), realtimeStart: new Date("2026-10-15"), isInitialRelease: true, source: "alfred" },
    { obsDate: new Date("2026-10-14"), value: 70, availableAt: new Date("2026-10-16"), realtimeStart: new Date("2026-10-16"), isInitialRelease: false, source: "alfred" },
  ]);
  const r = await m.queryMarketData({ ...raw, dataCutoff: "2026-10-21T00:00:00Z" });
  assert.equal(r.series[0]!.points[0]!.value, 70);
  assert.equal(r.series[0]!.points[0]!.revised, true);
  assert.equal(r.series[0]!.points[0]!.publishedAt, "2026-10-15");
  assert.match(r.series[0]!.revisionFingerprint, /^[0-9a-f]{64}$/);
});
test("shared cursor bounds union dates and cannot skip sparse-series observations", async t => {
  fixture(t); const [, data] = await market;
  let cursor: string | undefined;
  const dates: string[] = [], wtiValues: (number | null)[] = [];
  for (let i = 0; i < 3; i++) {
    const page = await data.queryMarketData({ indicatorIds: [wti.id, brent.id], startDate: "2026-10-01", endDate: "2026-10-28", maxPoints: 1, cursor });
    assert.equal(page.series[0]!.points.length, 1);
    dates.push(page.series[0]!.points[0]!.date); wtiValues.push(page.series[0]!.points[0]!.value);
    cursor = page.nextCursor ?? undefined;
    if (!page.truncated) break;
  }
  assert.deepEqual(dates, ["2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.deepEqual(wtiValues, [70, null, 69]);
  assert.equal(cursor, undefined);
});
test("exact-date Brent–WTI calculation, unit conversion and mixed-basis refusal", async t => {
  fixture(t); const [, data, calc, , , tools] = await market;
  const r = await data.queryMarketData({ indicatorIds: [brent.id, wti.id], startDate: "2026-10-01", endDate: "2026-10-28" });
  const p = calculateMarketSchema.parse({ operation: "spread", leftIndicatorId: brent.id, rightIndicatorId: wti.id, startDate: "2026-10-01", endDate: "2026-10-28" });
  assert.deepEqual(calc.calculateSeries(p, r.series[0]!, r.series[1]!).points.map(p => p.value), [3, null, 7]);
  const futures = { ...r.series[1]!, indicator: { ...r.series[1]!.indicator, instrumentType: "futures" } };
  assert.throws(() => calc.calculateSeries(p, r.series[0]!, futures), /口径不同/);
  assert.doesNotThrow(() => calc.calculateSeries({ ...p, allowDifferentInstrumentTypes: true }, r.series[0]!, futures));
  assert.throws(() => calc.calculateSeries(p, { ...r.series[0]!, indicator: { ...r.series[0]!.indicator, unit: "USD/gal" } }, r.series[1]!), /单位不一致/);
  assert.equal(calc.calculateSeries({ ...p, leftConversion: "usd_per_gallon_to_usd_per_barrel" }, { ...r.series[0]!, indicator: { ...r.series[0]!.indicator, unit: "USD/gal" } }, r.series[1]!).points[0]!.value, 73 * 42 - 70);
  await assert.rejects(tools.runMarketTool("query_market_data", {}, { ...principal, scopes: [] }), /缺少权限/);
});
test("existing oil chart discovery and details reuse template; price chart has exact-date nulls", async t => {
  fixture(t); const [, , , charts] = await market;
  const found = await charts.searchCharts({ query: "原油 Brent WTI", tags: ["oil"] });
  assert.ok(found.charts.some(c => c.chartId === chartId));
  const c = await charts.getChart({ chartId });
  assert.equal(c.supportsEmbed, true);
  assert.deepEqual(new Set(c.indicators.map(i => i.indicatorId)), new Set([wti.id, brent.id]));
  const data = await charts.renderChartData(c, "2026-10-01", "2026-10-28");
  assert.deepEqual(data.categories, ["2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.ok(data.series.some(s => s.data[1] === null));
  await assert.rejects(charts.getChart({ chartId: "private-user-template:0" }), /不存在/);
});
test("attach after heading is atomic, optimistic, audited, idempotent and draft-only", async t => {
  fixture(t); const [, , , , attach] = await market;
  let row = { id: articleId, authorId: "owner", title: "测试草稿", slug: "test-draft", summary: "测试", category: "energy", tags: [], bodyMarkdown: "## 一、原油背离\n\n正文", sourceManifest: [], status: "draft", dataCutoff: null, createdAt: new Date(), updatedAt: new Date("2026-10-01"), publishedAt: null, coverImageUrl: null, author: { username: "owner" }, assets: [] };
  const assets: Record<string, unknown>[] = [];
  t.mock.method(prisma.article, "findFirst", async ({ where }: { where: { authorId: string } }) => where.authorId === row.authorId ? row : null);
  t.mock.method(prisma.article, "findUnique", async () => row);
  t.mock.method(prisma.articleAsset, "findMany", async () => assets);
  t.mock.method(prisma.articleAsset, "create", async ({ data }: { data: Record<string, unknown> }) => { assets.push(data); return data; });
  t.mock.method(prisma.article, "updateMany", async ({ data, where }: { data: Partial<typeof row>; where: { updatedAt: Date } }) => { if (row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 }; row = { ...row, ...data }; return { count: 1 }; });
  const raw = { articleId, chartId, displayStartDate: "2026-10-01", displayEndDate: "2026-10-28", placement: { type: "after_heading", heading: "一、原油背离" }, expectedUpdatedAt: row.updatedAt.toISOString(), renderMode: "snapshot" };
  await assert.rejects(attach.attachChartToArticle(raw, { ...principal, userId: "stranger" }), /不存在/);
  await assert.rejects(attach.attachChartToArticle({ ...raw, expectedUpdatedAt: "2026-09-01T00:00:00Z" }, principal), /文章已被/);
  const added = await attach.attachChartToArticle(raw, principal);
  assert.equal(added.changed, true);
  assert.ok(row.bodyMarkdown.indexOf("gekko-chart") < row.bodyMarkdown.indexOf("正文"));
  assert.equal(assets.length, 1);
  const stored = JSON.parse(Buffer.from(assets[0]!.data as Uint8Array).toString());
  assert.ok(stored.snapshot.series.length);
  assert.equal(stored.renderMode, "snapshot");
  assert.equal((assets[0]!.sourceConfig as Record<string, unknown>).actorId, "owner");
  assert.equal((await attach.attachChartToArticle(raw, principal)).changed, false);
  assert.equal(assets.length, 1);
  row.status = "published";
  await assert.rejects(attach.attachChartToArticle(raw, principal), /先撤回/);
});
test("strict references cannot inject HTML, scripts, URLs or ambiguous placement", async () => {
  assert.equal(parseChartRouteId(encodeURIComponent(chartId)), chartId);
  assert.equal(parseChartRouteId(chartId), chartId);
  assert.equal(parseChartRouteId("%"), null);
  assert.equal(parseChartRouteId("..%2Fprivate:0"), null);
  assert.equal(chartReferenceId('{"referenceId":"javascript:alert(1)"}'), null);
  assert.equal(chartReferenceId(JSON.stringify({ referenceId: articleId, url: "https://evil.invalid" })), null);
  assert.throws(() => insertChartReference("## 重复\n## 重复", "x", { type: "after_heading", heading: "重复" }), /重复/);
  assert.throws(() => insertChartReference("```\n## 代码标题\n```", "x", { type: "after_heading", heading: "代码标题" }), /未找到/);
  assert.equal(queryMarketSchema.safeParse({ indicatorIds: ["';DROP TABLE x;--"], startDate: "2026-10-01", endDate: "2026-10-28" }).success, false);
  assert.equal(attachChartSchema.safeParse({ articleId, chartId, displayStartDate: "2026-10-28", displayEndDate: "2026-10-01", expectedUpdatedAt: new Date().toISOString() }).success, false);
  const { ArticleMarkdown } = await import("../../components/articles/ArticleMarkdown");
  const html = renderToStaticMarkup(createElement(ArticleMarkdown, { content: "# 正文\n" + chartReferenceMarkdown(articleId) + '\n<script>alert(1)</script>' }));
  assert.ok(html.includes('data-gekko-chart="' + articleId + '"'));
  assert.ok(html.includes("正在加载图表"));
  assert.ok(!html.includes("<script>"));
});
test("delivery route protects drafts, renders published snapshots, denies macro access and degrades on source failure", async t => {
  fixture(t);
  const { NextRequest } = await import("next/server");
  const { GET } = await import("../../app/api/article-charts/[id]/route");
  const { invalidateFeatureAccessCache } = await import("../access/featureAccess");
  const [, , , charts] = await market;
  const definition = await charts.getChart({ chartId });
  const snapshot = await charts.renderChartData(definition, "2026-10-01", "2026-10-28");
  const stored = { version: 1, chartId, renderMode: "snapshot", definition, snapshot, createdAt: new Date().toISOString(), dataCutoff: new Date().toISOString(), displayStartDate: "2026-10-01", displayEndDate: "2026-10-28", displayOptions: { height: 420, showSource: true, showLastUpdated: true, allowTimeRangeChange: true } };
  let status = "draft";
  t.mock.method(prisma.featureAccessPolicy, "findUnique", async () => null);
  t.mock.method(prisma.articleAsset, "findUnique", async () => ({ data: Buffer.from(JSON.stringify(stored)), sourceKind: "chart-reference", article: { authorId: "owner", status, bodyMarkdown: chartReferenceMarkdown(articleId) } }));
  const context = { params: Promise.resolve({ id: articleId }) };
  const request = new NextRequest(`https://example.com/api/article-charts/${articleId}`);
  invalidateFeatureAccessCache();
  assert.equal((await GET(request, context)).status, 401);
  status = "published";
  t.mock.method(prisma.macroObservation, "findMany", async () => { throw new Error("snapshot must not read revised live prices"); });
  const published = await GET(request, context);
  assert.equal(published.status, 200);
  assert.equal((await published.json()).data.series.length, 2);
  assert.equal(published.headers.get("cache-control"), "private, no-store");
  const { GET: rawAsset } = await import("../../app/api/article-assets/[id]/route");
  assert.equal((await rawAsset(request, context)).status, 404);
  t.mock.method(prisma.featureAccessPolicy, "findUnique", async () => ({ policy: { features: { macro: { status: "released", proOnly: true } } } }));
  invalidateFeatureAccessCache();
  assert.equal((await GET(request, context)).status, 403);
  t.mock.method(prisma.featureAccessPolicy, "findUnique", async () => ({ policy: { features: { articles: { status: "released", proOnly: true } } } }));
  assert.equal((await GET(request, context)).status, 403);
  t.mock.method(prisma.featureAccessPolicy, "findUnique", async () => null);
  invalidateFeatureAccessCache();
  t.mock.method(prisma.systemMacroChartPrefs, "findUnique", async () => { throw new Error("source database unavailable"); });
  const original = console.error; console.error = () => {};
  try {
    const failure = await GET(request, context);
    assert.equal(failure.status, 400);
    assert.equal((await failure.json()).code, "DATA_UNAVAILABLE");
  } finally { console.error = original; invalidateFeatureAccessCache(); }
});

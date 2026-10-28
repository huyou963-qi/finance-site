import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import type { ChartData } from "./charts";

const db = { article: { findFirst() {}, updateMany() {} }, articleAsset: { findFirst() {}, create() {} }, instrument: { findFirst() {} }, systemMacroChartPrefs: { findUnique() {} }, macroObservation: { findMany() {}, aggregate() {} }, macroObservationVintage: { findMany() {} }, $transaction() {}, $executeRaw() {}, $queryRaw() {} };
(globalThis as unknown as { prisma: PrismaClient }).prisma = db as unknown as PrismaClient;
const modules = import("./chartImage");
const id = "54a31a40-32f6-4f72-8533-d07855442b6a";
const principal = { userId: "owner", grantId: "grant", scopes: ["articles:write"] };
test("chart export renders real ECharts SVG into a valid PNG, with exact dimensions", async () => {
  const { renderChartPng } = await modules;
  const png = await renderChartPng({ title: "WTI / Brent", categories: ["2026-10-14", "2026-10-15"], series: [{ key: "wti", name: "WTI (USD/bbl)", unit: "USD/bbl", data: [70, 71] }], visualMap: {}, slot: 0 } as ChartData, 1200, 675);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const info = await sharp(png).metadata(); assert.equal(info.width, 1200); assert.equal(info.height, 675);
  const stats = await sharp(png).stats(); assert.ok(stats.channels.some(c => c.stdev > 1));
});
test("cover updates use narrow CAS and same thumbnail field, without changing publication state", async t => {
  const { setArticleCover } = await modules;
  let row = { id, authorId: "owner", status: "draft", coverImageUrl: null as string | null, updatedAt: new Date("2026-10-01") };
  t.mock.method(db.article, "findFirst", async ({ where }: { where: { authorId: string } }) => where.authorId === row.authorId ? row : null);
  t.mock.method(db.articleAsset, "findFirst", async () => null);
  t.mock.method(db.article, "updateMany", async ({ where, data }: { where: { updatedAt: Date }; data: Partial<typeof row> }) => {
    assert.deepEqual(Object.keys(data).sort(), ["coverImageUrl", "updatedAt"]);
    if (where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 };
    row = { ...row, ...data }; return { count: 1 };
  });
  const raw = { articleId: id, imageUrl: "https://example.com/chart.png", expectedUpdatedAt: row.updatedAt.toISOString() };
  await assert.rejects(setArticleCover(raw, { ...principal, scopes: [] }), /缺少权限/);
  await assert.rejects(setArticleCover(raw, { ...principal, userId: "stranger" }), /不属于/);
  await assert.rejects(setArticleCover({ ...raw, imageUrl: "/api/article-assets/" + id }, principal), /不属于/);
  const saved = await setArticleCover(raw, principal); assert.equal(saved.thumbnailUrl, raw.imageUrl); assert.equal(row.status, "draft");
  assert.equal((await setArticleCover(raw, principal)).changed, false);
  await assert.rejects(setArticleCover({ ...raw, imageUrl: "https://example.com/other.png" }, principal), /文章已被/);
  row.status = "published";
  await assert.rejects(setArticleCover(raw, principal), /缺少权限/);
  await setArticleCover({ ...raw, imageUrl: "https://example.com/published.png", expectedUpdatedAt: row.updatedAt.toISOString() }, { ...principal, scopes: ["articles:write", "articles:publish"] });
  assert.equal(row.status, "published");
});
test("export limits and cover URL schemes reject executable input", async () => {
  const m = await modules;
  for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,foo", "//evil.example/x", "https://user:password@example.com/x"]) assert.throws(() => m.normalizeCoverUrl(imageUrl));
  assert.equal(m.captureChartImageSchema.safeParse({ articleId: id, chartId: "builtin-us-oil-diesel-monitor:0", startDate: "2026-10-01", endDate: "2026-10-28", width: 99999 }).success, false);
});
test("capture persists PNG provenance and retries reuse the same article attachment", async t => {
  const { captureChartImage } = await modules;
  let saved: Record<string, unknown> | null = null;
  let writes = 0;
  t.mock.method(db.article, "findFirst", async () => ({ id, authorId: "owner", status: "draft" }));
  t.mock.method(db.systemMacroChartPrefs, "findUnique", async () => null);
  t.mock.method(db.instrument, "findFirst", async ({ where }: { where: { OR: { fredSeriesId?: string; id?: string }[] } }) => {
    const fredSeriesId = where.OR.find(x => x.fredSeriesId)?.fredSeriesId ?? (where.OR.some(x => x.id === "e266276f-a6d1-49ad-9075-daf23b21a548") ? "DCOILBRENTEU" : "DCOILWTICO");
    return { id: fredSeriesId === "DCOILWTICO" ? id : "e266276f-a6d1-49ad-9075-daf23b21a548", code: `sched_fred_${fredSeriesId}`, fredSeriesId, name: fredSeriesId, freqLabel: "日", unit: "美元/桶", updatedAt: new Date("2026-10-01"), metadata: {} };
  });
  t.mock.method(db.macroObservation, "findMany", async () => [{ obsDate: new Date("2026-10-14"), value: 70 }, { obsDate: new Date("2026-10-15"), value: 71 }]);
  t.mock.method(db.macroObservationVintage, "findMany", async () => []);
  t.mock.method(db.macroObservation, "aggregate", async () => ({ _min: { obsDate: new Date("2026-10-14") }, _max: { obsDate: new Date("2026-10-15") }, _count: 2 }));
  t.mock.method(db, "$transaction", async (work: (tx: typeof db) => unknown) => work(db));
  t.mock.method(db.articleAsset, "findFirst", async ({ where }: { where: { sourceConfig: { equals: string } } }) => saved && (saved.sourceConfig as Record<string, unknown>).operationHash === where.sourceConfig.equals ? { id } : null);
  t.mock.method(db.articleAsset, "create", async ({ data }: { data: Record<string, unknown> }) => { saved = data; writes++; return { id }; });
  const raw = { articleId: id, chartId: "builtin-us-oil-diesel-monitor:0", startDate: "2026-10-14", endDate: "2026-10-15" };
  const first = await captureChartImage(raw, principal);
  const second = await captureChartImage(raw, principal);
  assert.equal(first.assetId, second.assetId); assert.equal(writes, 1);
  assert.equal(saved!.mimeType, "image/png"); assert.equal(saved!.sourceKind, "chart-image");
  assert.ok((saved!.data as Buffer).byteLength > 1000);
  assert.equal((saved!.sourceConfig as Record<string, unknown>).chartId, raw.chartId);
  assert.ok(first.imageUrl.endsWith(`/api/article-assets/${id}`));
});

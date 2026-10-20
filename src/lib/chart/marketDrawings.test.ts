import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrawing, validateDrawings, updateDrawingPoint, drawingStorageKey, mergeDrawingVersions, DRAWING_GROUPS, pointCount } from "./marketDrawings";
import { drawingGeometry, drawingProjector, primitiveDistance } from "./drawingGeometry";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
const points = [{ t: 1700000000, p: 100 }, { t: 1700086400, p: 120 }, { t: 1700172800, p: 90 }];
test("all drawing tools round-trip through the strict storage validator", () => {
  for (const t of DRAWING_GROUPS.flatMap(g => g.tools)) {
    assert.equal(validateDrawings([createDrawing(t.id as Exclude<typeof t.id, "cursor">, points.slice(0, pointCount(t.id)), t.id)])[0].kind, t.id);
  }
});
test("reject malformed and oversized input instead of trusting stored JSON", () => {
  const valid = createDrawing("trend", points, "one");
  for (const input of [[{ ...valid, p1: NaN }], [{ ...valid, t1: -1 }], [{ ...valid, kind: "script" }], [valid, valid], [{ ...valid, color: "url(https://bad)" }], Array(301).fill(valid), [{ ...valid, lineWidth: 99 }]]) assert.throws(() => validateDrawings(input));
  assert.equal("userId" in validateDrawings([{ ...valid, userId: "other-user" }])[0], false);
  assert.throws(() => validateDrawings([{ ...createDrawing("text", points, "text"), text: "x".repeat(501) }]));
});
test("local keys isolate owners, instruments and adjustment while sharing intervals", () => {
  const key = drawingStorageKey("alice", "yahoo", "aapl", "forward");
  assert.equal(key, drawingStorageKey("alice", "yahoo", " AAPL ", "forward"));
  assert.notEqual(key, drawingStorageKey("bob", "yahoo", "AAPL", "forward"));
  assert.notEqual(key, drawingStorageKey(null, "yahoo", "AAPL", "forward"));
  assert.notEqual(key, drawingStorageKey("alice", "yahoo", "AAPL", "none"));
});
test("editing a third channel point preserves the first two anchors", () => {
  const d = createDrawing("channel", points, "channel");
  const changed = updateDrawingPoint(d, 2, { t: 1700200000, p: 88 });
  assert.deepEqual(changed, { ...d, t3: 1700200000, p3: 88 });
});
test("merge keeps identical objects once and preserves conflicting versions with new IDs", () => {
  const d = createDrawing("hline", points, "same-id");
  assert.deepEqual(mergeDrawingVersions([d], [d], () => "copy-id"), [d]);
  const changed = { ...d, color: "#ff0000" };
  assert.deepEqual(mergeDrawingVersions([d], [changed], () => "copy-id"), [d, { ...changed, id: "copy-id" }]);
});
const project = (t: number, p: number) => ({ x: (t - points[0].t) / 86400 * 100, y: 200 - p });
test("fib retracement preserves anchor direction when reversed", () => {
  const a = drawingGeometry(createDrawing("fib", points, "fib"), project, 500, 300);
  const b = drawingGeometry(createDrawing("fib", [points[1], points[0]], "fib"), project, 500, 300);
  assert.equal(a[0].a.y, 100); assert.equal(b[0].a.y, 80);
});
test("long and short tools compute directional reward/risk and warn on invalid stop", () => {
  const long = drawingGeometry(createDrawing("long", points, "long"), project, 500, 300);
  assert.ok(long.some(p => p.kind === "text" && p.label === "盈亏比 2.00"));
  const short = drawingGeometry(createDrawing("short", [points[0], { ...points[1], p: 80 }, { ...points[2], p: 110 }], "short"), project, 500, 300);
  assert.ok(short.some(p => p.kind === "text" && p.label === "盈亏比 2.00"));
  const invalid = drawingGeometry(createDrawing("short", points, "short"), project, 500, 300);
  assert.ok(invalid.some(p => p.kind === "text" && p.label.includes("正确方向")));
});
test("shape hit tests select borders and skip hidden objects", () => {
  const d = createDrawing("rect", points, "rect");
  const shape = drawingGeometry(d, project, 500, 300)[0];
  assert.equal(primitiveDistance({ x: 50, y: 80 }, shape), 0);
  assert.equal(primitiveDistance({ x: 50, y: 90 }, shape), 10);
  assert.deepEqual(drawingGeometry({ ...d, hidden: true }, project, 500, 300), []);
});
test("cross-timeframe anchors interpolate between actual trading bars", () => {
  const chart = { timeScale: () => ({ timeToCoordinate: (t: number) => t === 100 ? 0 : t === 200 ? 100 : null, logicalToCoordinate: (v: number) => Number.isInteger(v) ? v * 100 : 0 }) } as unknown as IChartApi;
  const candle = { data: () => [{ time: 100 }, { time: 200 }], priceToCoordinate: (p: number) => p } as unknown as ISeriesApi<"Candlestick", Time>;
  assert.deepEqual(drawingProjector(chart, candle)(150, 123), { x: 50, y: 123 });
});

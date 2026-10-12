import assert from "node:assert/strict";
import { test } from "node:test";
import { clipDrawingLine, drawingGeometry, primitiveDistance } from "./drawingGeometry";
import { createDrawing, drawingLabel, validateDrawings } from "./marketDrawings";
const project = (t: number, p: number) => ({ x: t, y: p });
const points = [{ t: 50, p: 100 }, { t: 150, p: 150 }];
test("straight line extends on both sides; segment stops at its anchors; ray starts at its first anchor", () => {
  const straight = drawingGeometry(createDrawing("extended", points, "line"), project, 500, 300)[0];
  assert.deepEqual(straight, { kind: "line", a: { x: 0, y: 75 }, b: { x: 450, y: 300 }, label: undefined, color: undefined });
  const segment = drawingGeometry(createDrawing("trend", points, "segment"), project, 500, 300)[0];
  assert.equal(segment.a.x, 50);
  assert.equal(primitiveDistance({ x: 10, y: 80 }, straight), 0);
  assert.ok(primitiveDistance({ x: 10, y: 80 }, segment) > 40);
  const ray = drawingGeometry(createDrawing("ray", points, "ray"), project, 500, 300)[0];
  assert.equal(ray.a.x, 50);
  assert.ok(primitiveDistance({ x: 10, y: 80 }, ray) > 40);
});
test("straight lines support horizontal, vertical, reversed and far off-screen anchors", () => {
  assert.deepEqual(clipDrawingLine({ x: 50, y: 100 }, { x: 150, y: 100 }, 500, 300), { a: { x: 0, y: 100 }, b: { x: 500, y: 100 } });
  assert.deepEqual(clipDrawingLine({ x: 50, y: 100 }, { x: 50, y: 150 }, 500, 300), { a: { x: 50, y: 0 }, b: { x: 50, y: 300 } });
  assert.deepEqual(clipDrawingLine({ x: 150, y: 100 }, { x: 50, y: 100 }, 500, 300), { a: { x: 500, y: 100 }, b: { x: 0, y: 100 } });
  assert.deepEqual(clipDrawingLine({ x: -100000, y: 100 }, { x: -99999, y: 100 }, 500, 300), { a: { x: 0, y: 100 }, b: { x: 500, y: 100 } });
});
test("invisible and degenerate lines are skipped, and rays never extend behind their start", () => {
  assert.equal(clipDrawingLine({ x: 0, y: -20 }, { x: 30, y: -20 }, 500, 300), null);
  assert.equal(clipDrawingLine({ x: 20, y: 20 }, { x: 20, y: 20 }, 500, 300), null);
  assert.equal(clipDrawingLine({ x: 600, y: 100 }, { x: 700, y: 100 }, 500, 300, false), null);
});
test("existing extended drawings keep their storage kind and appear as straight lines", () => {
  const line = createDrawing("extended", points, "existing");
  assert.equal(validateDrawings([line])[0].kind, "extended");
  assert.equal(drawingLabel("extended"), "直线");
  assert.equal(drawingLabel("trend"), "线段");
});

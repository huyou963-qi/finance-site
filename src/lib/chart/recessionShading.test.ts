import { test } from "node:test";
import assert from "node:assert/strict";
import type { SeriesAttachedParameter, Time } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { RecessionShading } from "./recessionShading";

test("shading follows logical coordinates, clips to pane, and clears when disabled", () => {
  let enabled = true;
  const primitive = new RecessionShading(() => enabled ? [{
    startMs: Date.UTC(2020, 2, 1), endMs: Date.UTC(2020, 4, 1) - 1,
    startLabel: "2020-03", endLabel: "2020-04",
  }] : []);
  primitive.attached({
    series: { data: () => ["2020-02-28", "2020-03-02", "2020-04-30", "2020-05-01"].map(time => ({ time })) },
    chart: { timeScale: () => ({ logicalToCoordinate: (index: number) => index * 20 - 20 }) },
    requestUpdate: () => {},
  } as unknown as SeriesAttachedParameter<Time>);
  const rectangles: number[][] = [];
  const target = { useMediaCoordinateSpace: (draw: (scope: unknown) => void) => draw({
    context: { fillRect: (...args: number[]) => rectangles.push(args) },
    mediaSize: { width: 100, height: 200 },
  }) } as unknown as CanvasRenderingTarget2D;
  const renderer = primitive.paneViews()[0].renderer();
  renderer.draw(target);
  assert.deepEqual(rectangles, [[0, 0, 30, 200]]);
  enabled = false;
  renderer.draw(target);
  assert.equal(rectangles.length, 1);
  primitive.detached();
  renderer.draw(target);
  assert.equal(rectangles.length, 1);
});

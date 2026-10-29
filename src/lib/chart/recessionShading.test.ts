import { test } from "node:test";
import assert from "node:assert/strict";
import type { SeriesAttachedParameter, Time } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { RecessionShading } from "./recessionShading";

test("shading follows actual timestamps, clips to pane, and clears when disabled", () => {
  let enabled = true;
  let panOffset = 0;
  const primitive = new RecessionShading(() => enabled ? [{
    startMs: Date.UTC(2020, 2, 1), endMs: Date.UTC(2020, 4, 1) - 1,
    startLabel: "2020-03", endLabel: "2020-04",
  }] : []);
  primitive.attached({
    series: { data: () => ["2020-02-28", "2020-03-02", "2020-04-30", "2020-05-01"].map(time => ({ time })) },
    chart: { timeScale: () => ({ options: () => ({ barSpacing: 20 }), timeToCoordinate: (time: string) => (new Map([["2020-03-02", 0], ["2020-04-30", 20]]).get(time) ?? 0) + panOffset }) },
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
  // 其他资产可在主图日期之间插入交易日；阴影必须由日期坐标决定。
  panOffset = 100;
  renderer.draw(target);
  assert.deepEqual(rectangles[1], [90, 0, 10, 200]);
  enabled = false;
  renderer.draw(target);
  assert.equal(rectangles.length, 2);
  primitive.detached();
  renderer.draw(target);
  assert.equal(rectangles.length, 2);
});

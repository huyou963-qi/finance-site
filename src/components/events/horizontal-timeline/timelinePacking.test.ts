import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTicks,
  fractionalYear,
  packTimelineCards,
  yearToX,
} from "./timelinePacking";

const W = 200;

function overlaps(items: ReturnType<typeof packTimelineCards>) {
  for (const lane of ["above", "below"] as const) {
    const row = items.filter((i) => i.lane === lane).sort((a, b) => a.left - b.left);
    for (let i = 1; i < row.length; i++) {
      if (row[i].left < row[i - 1].left + W) return true;
    }
  }
  return false;
}

test("fractionalYear spreads dates inside a year", () => {
  assert.equal(fractionalYear("2020-01-01T00:00:00.000Z"), 2020);
  const mid = fractionalYear("2020-07-02T00:00:00.000Z");
  assert.ok(mid > 2020.49 && mid < 2020.51);
  assert.ok(fractionalYear("2020-03-01T12:00:00.000Z") < fractionalYear("2020-03-02T12:00:00.000Z"));
});

test("sparse events get their own cards centred on the anchor", () => {
  const px = 14;
  const items = packTimelineCards(
    [
      { id: "a", t: 1800 },
      { id: "b", t: 1850 },
      { id: "c", t: 1900 },
    ],
    { pxPerYear: px, cardWidth: W },
  );
  assert.equal(items.length, 3);
  for (const it of items) {
    assert.equal(it.ids.length, 1);
    assert.equal(it.stemOffset, W / 2);
    assert.equal(it.left + it.stemOffset, it.minX);
  }
  assert.equal(overlaps(items), false);
});

test("dense events never overlap: they cluster at low zoom and split when zoomed in", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, t: 2020 + i / 50 }));

  const low = packTimelineCards(events, { pxPerYear: 14, cardWidth: W });
  assert.equal(overlaps(low), false);
  assert.ok(low.length <= 3);
  assert.equal(low.reduce((n, i) => n + i.ids.length, 0), 50);

  const high = packTimelineCards(events, { pxPerYear: 14 * 420, cardWidth: W });
  assert.equal(overlaps(high), false);
  assert.equal(high.length, 50);
  for (const it of high) {
    // 连接线始终落在卡片内部并指向锚点
    assert.ok(it.stemOffset >= 18 && it.stemOffset <= W - 18);
    assert.equal(Math.round(it.left + it.stemOffset), Math.round(it.minX));
  }
});

test("ticks switch from years to months and stay inside the requested range", () => {
  const coarse = buildTicks(14, 0, yearToX(2026, 14));
  assert.ok(coarse.every((t) => /^\d{4}$/.test(t.label ?? "")));

  const px = 14 * 100;
  const from = yearToX(2020, px);
  const to = yearToX(2021, px);
  const fine = buildTicks(px, from, to);
  assert.ok(fine.some((t) => t.label === "2020" && t.major));
  assert.ok(fine.some((t) => t.label?.endsWith("月")));
  assert.ok(fine.every((t) => t.x >= from && t.x <= to));
});

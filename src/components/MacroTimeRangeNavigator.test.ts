import assert from "node:assert/strict";
import test from "node:test";
import { buildLabelTicks } from "./MacroTimeRangeNavigator";

const MONTHS = Array.from({ length: 48 }, (_, index) => {
  const date = new Date(Date.UTC(2023, index, 1));
  return date.toISOString().slice(0, 10);
});

test("time navigator limits labels to the available mobile slots", () => {
  const ticks = buildLabelTicks(MONTHS, 3);

  assert.equal(ticks.length, 3);
  assert.deepEqual(ticks.map((tick) => tick.label), [MONTHS[0], MONTHS[24], MONTHS[47]]);
});

test("time navigator keeps the first and last labels at every width", () => {
  for (const maxTicks of [2, 3, 5, 11]) {
    const ticks = buildLabelTicks(MONTHS, maxTicks);
    assert.ok(ticks.length <= maxTicks);
    assert.equal(ticks[0]?.label, MONTHS[0]);
    assert.equal(ticks.at(-1)?.label, MONTHS.at(-1));
  }
});

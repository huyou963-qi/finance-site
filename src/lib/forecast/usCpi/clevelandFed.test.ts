import assert from "node:assert/strict";
import test from "node:test";
import { clevelandAsOf, parseClevelandNowcast } from "./clevelandFed";

const block = {
  chart: { subcaption: "2026-9" },
  categories: [
    {
      category: [
        { label: "09/01" },
        { label: "09/11" },
        { label: "CPI Aug", vline: "true" },
        { label: "09/22" },
        { label: "09/24" },
      ],
    },
  ],
  dataset: [
    { seriesname: "CPI Inflation", data: [{ value: "0.25" }, { value: "0.36" }, { value: "0.43" }, { value: "0.45" }] },
    { seriesname: "Core CPI Inflation", data: [{ value: "0.2" }, { value: "0.21" }, { value: "0.20" }, { value: "0.19" }] },
  ],
};

test("aligns data to non-vline labels and picks the last nowcast on or before the cutoff day", () => {
  const m = parseClevelandNowcast([block]).get("2026-09-01")!;
  assert.equal(clevelandAsOf(m, 22)?.label, "09/22");
  assert.equal(clevelandAsOf(m, 22)?.all, 0.43);
  assert.equal(clevelandAsOf(m, 10)?.label, "09/01");
  assert.equal(clevelandAsOf(m, 31)?.label, "09/24");
  assert.equal(m.latest?.label, "09/24");
});

test("empty values are skipped and labels outside the target month never count as as-of", () => {
  const m = parseClevelandNowcast([
    {
      chart: { subcaption: "2013-7" },
      categories: [{ category: [{ label: "07/05" }, { label: "08/02" }] }],
      dataset: [
        { seriesname: "CPI Inflation", data: [{ value: "" }, { value: "0.3" }] },
        { seriesname: "Core CPI Inflation", data: [{ value: "" }, { value: "0.2" }] },
      ],
    },
  ]).get("2013-07-01")!;
  assert.equal(clevelandAsOf(m, 31), null);
  assert.equal(m.latest?.label, "08/02");
});

test("rejects a non-array payload", () => {
  assert.throws(() => parseClevelandNowcast({}), /根节点/);
});

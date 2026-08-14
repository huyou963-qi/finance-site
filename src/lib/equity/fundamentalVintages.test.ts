import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSecFundamentalVintages,
  listSecPeriodicFilings,
} from "./fundamentalVintages";

const facts = {
  entityName: "Vintage Test",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [
            {
              start: "2023-01-01",
              end: "2023-03-31",
              val: 100,
              form: "10-Q",
              fp: "Q1",
              filed: "2023-05-01",
              accn: "0001-23-000001",
            },
            {
              start: "2023-01-01",
              end: "2023-03-31",
              val: 110,
              form: "10-Q/A",
              fp: "Q1",
              filed: "2023-06-01",
              accn: "0001-23-000002",
            },
          ],
        },
      },
    },
  },
};

test("listSecPeriodicFilings uses accession + filed date and ignores non-periodic facts", () => {
  assert.deepEqual(listSecPeriodicFilings(facts), [
    { accession: "0001-23-000001", form: "10-Q", filedAt: "2023-05-01" },
    { accession: "0001-23-000002", form: "10-Q/A", filedAt: "2023-06-01" },
  ]);
});

test("buildSecFundamentalVintages preserves the original and amended filing values", () => {
  const rows = buildSecFundamentalVintages(facts);
  const periodRows = rows.filter((row) => row.period === "2023Q1");
  assert.equal(periodRows.length, 2);
  assert.deepEqual(
    periodRows.map((row) => [row.accession, row.revenue, row.checkpoint]),
    [
      ["0001-23-000001", 100, true],
      ["0001-23-000002", 110, false],
    ],
  );
});

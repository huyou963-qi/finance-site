import assert from "node:assert/strict";
import { test } from "node:test";
import { RELEASE_PACKAGE_CATALOG } from "./releasePackageCatalog";
import {
  US_BALANCE_OF_PAYMENTS_FRED_SERIES,
  US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS,
  US_BOP_REUSED_FRED_SERIES,
  US_BOP_SUPPLEMENTAL_FRED_SERIES,
} from "./usBalanceOfPaymentsFredSeedCatalog";

test("BOP canonical catalog is complete, unique, and keeps reused IEABC out of the seed list", () => {
  const canonical = [...US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS];
  const seeded = US_BALANCE_OF_PAYMENTS_FRED_SERIES.map((row) => row.fredId);

  assert.equal(canonical.length, 108);
  assert.equal(new Set(canonical).size, 108);
  assert.equal(US_BOP_SUPPLEMENTAL_FRED_SERIES.length, 98);
  assert.equal(US_BOP_REUSED_FRED_SERIES.length, 1);
  assert.equal(US_BALANCE_OF_PAYMENTS_FRED_SERIES.length, 110);
  assert.equal(new Set(seeded).size, 110);
  assert.ok(canonical.includes("IEABC"));
  assert.ok(!seeded.includes("IEABC"));
});

test("BOP release package has all 108 members and uses the economic calendar", () => {
  const pkg = RELEASE_PACKAGE_CATALOG.find(
    (row) => row.id === "us.bea.international_transactions",
  );

  assert.ok(pkg);
  assert.equal(pkg.release.type, "economic_calendar");
  assert.equal(pkg.members.fredSeriesIds?.length, 108);
  assert.deepEqual(
    new Set(pkg.members.fredSeriesIds),
    new Set(US_BOP_INTERNATIONAL_TRANSACTIONS_FRED_IDS),
  );
});

test("BOP business leaves remain below the 48-series catalog limit", () => {
  const counts = new Map<string, number>();
  for (const row of US_BALANCE_OF_PAYMENTS_FRED_SERIES) {
    if (row.releasePackageId !== "us.bea.international_transactions") continue;
    counts.set(row.accountGroup, (counts.get(row.accountGroup) ?? 0) + 1);
  }
  counts.set("国际收支总表", (counts.get("国际收支总表") ?? 0) + 1);

  assert.deepEqual(Object.fromEntries(counts), {
    国际收支总表: 14,
    金融账户资产: 22,
    金融账户负债: 14,
    经常账户借方: 28,
    经常账户贷方: 30,
  });
  assert.ok([...counts.values()].every((count) => count <= 48));
});

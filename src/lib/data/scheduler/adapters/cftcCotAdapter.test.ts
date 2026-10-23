import assert from "node:assert/strict";
import test from "node:test";
import { fetchCftcCotIncremental } from "./cftcCotAdapter";
import { clearCftcCotCache } from "../cftcCot/client";
import { COT_MM_PRODUCTS } from "../../cot/cotProductCatalog";

const product = COT_MM_PRODUCTS.find((p) => p.slug === "gold")!;
const row = (date: string, commodity = "GOLD") => ({
  report_date_as_yyyy_mm_dd: date, commodity,
  market_and_exchange_names: `${commodity} - COMMODITY EXCHANGE INC.`,
  m_money_positions_long_all: "100", m_money_positions_short_all: "40", open_interest_all: "1000",
});

test("cold start requests full official history; source latest is specific to gold", async (t) => {
  clearCftcCotCache();
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input)); requests.push(url.searchParams.get("$where")!);
    return Response.json([row("2006-06-13"), row("2026-10-13"), row("2026-10-20", "SILVER")]);
  });
  t.after(clearCftcCotCache);
  for (const [metric, expected] of [["long", 100], ["short", 40], ["net", 60]] as const) {
    const result = await fetchCftcCotIncremental({ cot: { productSlug: "gold", metric, match: product.match } }, "1950-01-01");
    assert.equal(result.points.length, 2);
    assert.equal(result.points[0]!.obsDate.toISOString().slice(0, 10), "2006-06-13");
    assert.equal(result.points[0]!.value, expected);
    assert.equal(result.sourceLatestObsDate?.toISOString().slice(0, 10), "2026-10-13");
  }
  assert.equal(requests.length, 1);
  assert.ok(requests[0]!.includes("2006-01-01"));
});

test("a report without matching gold must fail rather than mark the subscription current", async (t) => {
  clearCftcCotCache();
  t.mock.method(globalThis, "fetch", async () => Response.json([row("2026-10-20", "SILVER")]));
  t.after(clearCftcCotCache);
  await assert.rejects(fetchCftcCotIncremental({ cot: { productSlug: "gold", metric: "long", match: product.match } }, "2026-08-01"), /无匹配数据/);
});

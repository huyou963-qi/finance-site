import test from "node:test";
import assert from "node:assert/strict";
import { makeMarketQuote } from "./marketQuote";

test("daily return uses previous close, including declines and unchanged prices", () => {
  assert.ok(Math.abs(makeMarketQuote("AAPL", { price: 105, previousClose: 100 })!.changePercent! - 5) < 1e-10);
  assert.ok(Math.abs(makeMarketQuote("AAPL", { price: 95, previousClose: 100 })!.changePercent! + 5) < 1e-10);
  assert.equal(makeMarketQuote("AAPL", { price: 100, previousClose: 100 })!.changePercent, 0);
});

test("missing quotes and vendor placeholders never become zero prices or zero returns", () => {
  for (const price of [null, undefined, "-", "123", 0, -1, NaN, Infinity]) {
    assert.equal(makeMarketQuote("AAPL", { price }), null);
  }
  for (const previousClose of [null, undefined, "-", 0, -1, NaN]) {
    assert.equal(makeMarketQuote("AAPL", { price: 100, previousClose })!.changePercent, null);
  }
});

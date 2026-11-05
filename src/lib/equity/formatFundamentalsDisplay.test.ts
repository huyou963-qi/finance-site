import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactMoney,
  formatCompactMoneyAxis,
  formatEps,
  formatFundamentalSeriesValue,
  formatMultiplier,
  formatPct,
  formatPctAxis,
  formatPp,
  formatSignedPct,
} from "./formatFundamentalsDisplay";

test("formatCompactMoney shortens billions and trims long integers", () => {
  assert.equal(formatCompactMoney(39_331_000_000), "39.33B");
  assert.equal(formatCompactMoney(-1_250_000_000), "-1.25B");
  assert.equal(formatCompactMoney(2_500_000), "2.5M");
  assert.equal(formatCompactMoney(1_200_000_000_000), "1.20T");
  assert.equal(formatCompactMoney(null), "—");
  assert.equal(formatCompactMoney(Number.NaN), "—");
});

test("formatCompactMoneyAxis uses shorter axis labels", () => {
  assert.equal(formatCompactMoneyAxis(100_000_000_000), "100.0B");
  assert.equal(formatCompactMoneyAxis(20_000_000), "20M");
});

test("percent formatters convert ratios with limited decimals", () => {
  assert.equal(formatPct(0.6052380736235304), "60.5%");
  assert.equal(formatPct(0.6052380736235304, 2), "60.52%");
  assert.equal(formatSignedPct(0.7794417047459621), "+77.9%");
  assert.equal(formatSignedPct(-0.1234), "-12.3%");
  assert.equal(formatPp(0.012), "+1.2pp");
  assert.equal(formatPctAxis(0.3), "30%");
});

test("formatFundamentalSeriesValue picks format by series name", () => {
  assert.equal(formatFundamentalSeriesValue("营收", 39_331_000_000), "39.33B");
  assert.equal(formatFundamentalSeriesValue("营收 YoY", 0.7794417047459621), "+77.9%");
  assert.equal(formatFundamentalSeriesValue("毛利率", 0.6052380736235304), "60.5%");
  assert.equal(formatFundamentalSeriesValue("营业利润率", 0.4910807498524806), "49.1%");
  assert.equal(formatFundamentalSeriesValue("净利率", 0.4261041260042667), "42.6%");
  assert.equal(formatFundamentalSeriesValue("EPS", 1.2345), "1.23");
  assert.equal(formatFundamentalSeriesValue("EPS YoY", 0.15), "+15.0%");
  assert.equal(formatFundamentalSeriesValue("经营现金流", 28_000_000_000), "28.00B");
  assert.equal(formatFundamentalSeriesValue("资本开支", -5_000_000_000), "-5.00B");
  assert.equal(formatFundamentalSeriesValue("ROE (TTM)", 0.55), "55.0%");
  assert.equal(formatFundamentalSeriesValue("权益乘数", 3.456), "3.5x");
  assert.equal(formatFundamentalSeriesValue("PE (TTM)", 28.456), "28.46");
  assert.equal(formatFundamentalSeriesValue("PB", 12.3), "12.30");
});

test("formatEps and formatMultiplier", () => {
  assert.equal(formatEps(0.99), "0.99");
  assert.equal(formatMultiplier(4.2), "4.2x");
});

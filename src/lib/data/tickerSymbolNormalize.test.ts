import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTickerSymbol } from "./tickerSymbolNormalize";
import { marketSymbolLabel, MARKET_INSTRUMENTS, marketInstrumentInputCodes, resolveMarketInstrumentInput } from "./marketInstruments";
import { parseWatchlistSymbol } from "./marketWatchlist";

test("common index codes resolve to the existing quote and watchlist symbols", () => {
  for (const [input, expected] of [
    ["US10Y", "^TNX"], [" us10y ", "^TNX"], ["^tnx", "^TNX"],
    ["DXY", "DX-Y.NYB"], [" dxy ", "DX-Y.NYB"], ["DX-Y.NYB", "DX-Y.NYB"],
  ]) {
    assert.equal(normalizeTickerSymbol(input), expected);
    assert.equal(parseWatchlistSymbol(input), expected);
  }
});

test("every catalog input alias resolves consistently without collisions", () => {
  const seen = new Map<string, string>();
  for (const item of MARKET_INSTRUMENTS) {
    assert.equal(normalizeTickerSymbol(marketSymbolLabel(item.symbol)), item.symbol);
    for (const code of marketInstrumentInputCodes(item)) {
      const key = code.toUpperCase();
      assert.ok(!seen.has(key) || seen.get(key) === item.symbol, key);
      seen.set(key, item.symbol);
      assert.equal(resolveMarketInstrumentInput(code)?.symbol, item.symbol);
      assert.equal(normalizeTickerSymbol(code.toLowerCase()), item.symbol);
    }
  }
});

test("common cross-asset codes and qualified codes share the same normalization", () => {
  for (const [raw, expected] of [
    ["US2Y", "US2Y"], ["US02Y", "US2Y"], ["TVC:US02Y", "US2Y"],
    ["US02YT", "US2Y"], ["FRED:DGS2", "US2Y"], ["USGG2YR", "US2Y"],
    ["US05Y", "^FVX"], ["US30Y", "^TYX"], ["TVC:DXY", "DX-Y.NYB"],
    ["SPX", "^GSPC"], ["US500", "^GSPC"], ["NAS100", "^NDX"],
    ["DJIA", "^DJI"], ["CBOE:VIX", "^VIX"], ["HSI", "^HSI"],
    ["EURUSD", "EURUSD=X"], ["EUR/USD", "EURUSD=X"], ["OANDA:USDJPY", "USDJPY=X"],
    ["COMEX:GC1!", "GC=F"], ["NYMEX:CL1!", "CL=F"],
    ["BTCUSD", "BTC-USD"], ["ETH/USD", "ETH-USD"], ["NASDAQ:SOXX", "SOXX"],
  ]) assert.equal(normalizeTickerSymbol(raw), expected, raw);
  for (const symbol of ["GOLD", "CL", "SI", "BTC", "SHY", "DGS", "DAX"]) {
    assert.equal(normalizeTickerSymbol(symbol), symbol);
  }
  assert.equal(normalizeTickerSymbol("TVC:DAX"), "^GDAXI");
  assert.equal(normalizeTickerSymbol("NASDAQ:DAX"), "DAX");
  assert.equal(normalizeTickerSymbol("NASDAQ:SPX"), "SPX");
});

test("watchlist labels use common codes while ordinary tickers remain intact", () => {
  assert.equal(marketSymbolLabel("^TNX"), "US10Y");
  assert.equal(marketSymbolLabel("DX-Y.NYB"), "DXY");
  assert.equal(marketSymbolLabel("GC=F"), "GC1!");
  assert.equal(marketSymbolLabel("EURUSD=X"), "EURUSD");
  assert.equal(marketSymbolLabel("BTC-USD"), "BTCUSD");
  for (const symbol of ["SOXX", "AAPL", "600519.SH", "XAUUSD"]) {
    assert.equal(marketSymbolLabel(symbol), symbol);
    assert.equal(normalizeTickerSymbol(symbol), symbol);
  }
  // Broad search keywords must not silently become a different instrument.
  assert.equal(normalizeTickerSymbol("gold"), "GOLD");
});

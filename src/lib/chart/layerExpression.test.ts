import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evalExprAst,
  listSymbolsInExpression,
  parseLayerExpression,
} from "./layerExpression";

describe("layerExpression", () => {
  it("parses single symbol", () => {
    const r = parseLayerExpression("AAPL");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.symbols, ["AAPL"]);
  });

  it("parses A - B and A / B", () => {
    const sub = parseLayerExpression("AAPL - MSFT");
    assert.equal(sub.ok, true);
    if (!sub.ok) return;
    assert.deepEqual(sub.symbols.sort(), ["AAPL", "MSFT"]);
    assert.equal(evalExprAst(sub.ast, { AAPL: 10, MSFT: 4 }), 6);

    const div = parseLayerExpression("AAPL / SPY");
    assert.equal(div.ok, true);
    if (!div.ok) return;
    assert.equal(evalExprAst(div.ast, { AAPL: 200, SPY: 400 }), 0.5);
  });

  it("parses parentheses chain", () => {
    const r = parseLayerExpression("(AAPL / SPY) - (MSFT / SPY)");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.symbols.sort(), ["AAPL", "MSFT", "SPY"]);
    const v = evalExprAst(r.ast, { AAPL: 200, MSFT: 100, SPY: 400 });
    assert.ok(v != null && Math.abs(v - 0.25) < 1e-9);
  });

  it("rejects division by zero", () => {
    const r = parseLayerExpression("AAPL / SPY");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(evalExprAst(r.ast, { AAPL: 1, SPY: 0 }), null);
  });

  it("lists symbols and strips index100 suffix", () => {
    assert.deepEqual(listSymbolsInExpression("aapl / spy | index100"), [
      "AAPL",
      "SPY",
    ]);
  });

  it("rejects illegal characters", () => {
    const r = parseLayerExpression("AAPL; DROP");
    assert.equal(r.ok, false);
  });
});

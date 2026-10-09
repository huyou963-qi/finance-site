import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWatchlistItem, parseWatchlistSymbol } from "./marketWatchlist";

test("自选股接受股票、指数、外汇及期货代码并统一大小写", () => {
  for (const [raw, expected] of [[" aapl ", "AAPL"], ["brk-b", "BRK-B"], ["^gspc", "^GSPC"], ["eurusd=x", "EURUSD=X"], ["cl=f", "CL=F"]]) {
    assert.equal(parseWatchlistSymbol(raw), expected);
  }
});

test("拒绝缺失或异常代码，避免删除请求退化为全列表删除", () => {
  for (const raw of [undefined, null, {}, "", "   ", "A".repeat(65), "<script>", "AAPL?x=1"]) {
    assert.throws(() => parseWatchlistSymbol(raw));
  }
});

test("条目校验限制字段类型及长度，并丢弃客户端提供的所属用户字段", () => {
  assert.deepEqual(parseWatchlistItem({ symbol: "aapl", name: " Apple Inc. ", exchange: " NASDAQ ", userId: "other-user" }), { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" });
  for (const item of [null, [], { symbol: "AAPL", name: "", exchange: "" }, { symbol: "AAPL", name: "A".repeat(201), exchange: "" }, { symbol: "AAPL", name: "Apple", exchange: "A".repeat(101) }, { symbol: "AAPL", name: 123, exchange: "" }]) {
    assert.throws(() => parseWatchlistItem(item));
  }
});

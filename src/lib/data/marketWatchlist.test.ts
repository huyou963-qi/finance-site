import assert from "node:assert/strict";
import { test } from "node:test";
import { applyWatchlistGroupChange, parseWatchlistGroupName, parseWatchlistItem, parseWatchlistSymbol, type WatchlistData } from "./marketWatchlist";

test("自选股接受股票、指数、外汇及期货代码并统一大小写", () => {
  for (const [raw, expected] of [[" aapl ", "AAPL"], ["brk-b", "BRK-B"], ["^gspc", "^GSPC"], ["eurusd=x", "EURUSD=X"], ["cl=f", "CL=F"]]) {
    assert.equal(parseWatchlistSymbol(raw), expected);
  }
});

test("分组改名保留归属，删除分组保留股票并移回未分组", () => {
  const state: WatchlistData = { groups: [{ id: "g1", name: "科技" }], stocks: [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ", groupId: "g1" }, { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", groupId: null }] };
  const renamed = applyWatchlistGroupChange(state, { action: "renameGroup", groupId: "g1", name: " 科技成长 " });
  assert.equal(renamed.groups[0].name, "科技成长");
  assert.equal(renamed.stocks[0].groupId, "g1");
  const deleted = applyWatchlistGroupChange(renamed, { action: "deleteGroup", groupId: "g1" });
  assert.equal(deleted.groups.length, 0);
  assert.equal(deleted.stocks.length, 2);
  assert.ok(deleted.stocks.every((stock) => stock.groupId === null));
  assert.equal(state.groups[0].name, "科技");
});

test("分组限制名称，防止重复或无效分组", () => {
  for (const value of [null, "", " ", "未分组", "全部", "A".repeat(31)]) assert.throws(() => parseWatchlistGroupName(value));
  const state: WatchlistData = { groups: [{ id: "g1", name: "科技" }], stocks: [{ symbol: "AAPL", name: "Apple", exchange: "NASDAQ" }] };
  assert.throws(() => applyWatchlistGroupChange(state, { action: "createGroup", groupId: "g2", name: "科技" }));
  assert.throws(() => applyWatchlistGroupChange(state, { action: "moveStock", groupId: "other", symbol: "AAPL" }));
  assert.throws(() => applyWatchlistGroupChange(state, { action: "deleteGroup", groupId: null }));
  assert.equal(applyWatchlistGroupChange(state, { action: "moveStock", groupId: "g1", symbol: "AAPL" }).stocks[0].groupId, "g1");
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

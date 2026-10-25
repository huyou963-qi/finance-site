import { test } from "node:test";
import assert from "node:assert/strict";
import history from "./sp500History.json";
import { historicalDailyMembership, archiveTicker } from "./membership";

test("历史名单首份快照前留空，按实际生效日切换而非当前成员反推", () => {
  const change = history.changes.find((r) => r.added.length && r.removed.length)!;
  const before = new Date(`${change.date}T00:00:00Z`); before.setUTCDate(before.getUTCDate() - 1);
  const dates = ["1995-01-03", history.firstDate, before.toISOString().slice(0, 10), change.date];
  const result = historicalDailyMembership(dates, [], [], history.lastDate);
  assert.equal(result.has("1995-01-03"), false);
  assert.equal(result.get(history.firstDate)!.size, history.initial.length);
  assert.ok(!result.get(dates[2])!.has(change.added[0].replace(/\./g, "-")));
  assert.ok(result.get(change.date)!.has(change.added[0].replace(/\./g, "-")));
});

test("旧归档代码有独立命名空间，不与复用代码的新公司行情覆盖合并", () => {
  assert.equal(archiveTicker("ALTR"), "WIKI:ALTR");
  assert.equal(archiveTicker("BRK.B"), "WIKI:BRK_B");
});

test("历史快照与当前名单桥接存在无法解释的差异时拒绝发布", () => {
  assert.throws(() => historicalDailyMembership(["2026-09-01"], ["WRONG"], [], "2026-09-01"), /桥接未通过/);
});


test("证券更名继续使用同一公司历史行情，不把Physicians旧DOC反向当成Healthpeak", async () => {
  const { normalizeSp500Ticker } = await import("@/lib/equity/wikipediaSp500Changes");
  assert.equal(normalizeSp500Ticker("MMC", "2023-01-04"), "MRSH");
  assert.equal(normalizeSp500Ticker("PEAK", "2023-01-04"), "DOC");
  assert.equal(normalizeSp500Ticker("HCP", "2015-01-02"), "DOC");
  assert.equal(normalizeSp500Ticker("DOC", "2023-01-04"), "DOC");
  assert.equal(normalizeSp500Ticker("ATVI", "2023-01-04"), "ATVI");
});


test("新发行人复用代码的回溯价格不得计入旧公司广度", async () => {
  const { historicalPriceTicker } = await import("./membership");
  assert.equal(historicalPriceTicker("VIAC", "2020-03-23"), "LEGACY:PARA");
  assert.equal(historicalPriceTicker("PARA", "2022-10-12"), "LEGACY:PARA");
  assert.equal(historicalPriceTicker("PARA", "2025-08-07"), "LEGACY:PARA");
  assert.equal(historicalPriceTicker("PARA", "2026-10-23"), "PARA");
  assert.equal(historicalPriceTicker("LB", "2020-03-23"), "LEGACY:LB");
  assert.equal(historicalPriceTicker("LB", "2026-10-23"), "LB");
  assert.equal(historicalPriceTicker("MMC", "2020-03-23"), "MRSH");
});


test("独立快照窗口和发行人身份守卫：原AGN不能使用新Actavis价格，原ARNC跟随HWM", async () => {
  const { historicalPriceKeys } = await import("./membership");
  assert.deepEqual(historicalPriceKeys("AGN", "2014-01-02"), ["LEGACY:AGN", "Q12:LEGACY:AGN", "Q12S:LEGACY:AGN"]);
  assert.equal(historicalPriceKeys("AGN", "2016-01-04")[0], "AGN");
  assert.equal(historicalPriceKeys("IAC", "2007-01-03")[0], "MTCH");
  assert.equal(historicalPriceKeys("IACI", "2008-08-19")[0], "MTCH");
  assert.equal(historicalPriceKeys("IAC", "2020-07-01")[0], "IAC");
  assert.equal(historicalPriceKeys("ARNC", "2020-04-01")[0], "HWM");
  assert.equal(historicalPriceKeys("CTL", "2020-04-02")[0], "LUMN");
  assert.equal(historicalPriceKeys("MYL", "2020-04-02")[0], "VTRS");
  assert.deepEqual(historicalPriceKeys("PARA", "2022-10-12").slice(0, 3), ["LEGACY:PARA", "Y22:LEGACY:PARA", "Y20:LEGACY:PARA"]);
  assert.ok(historicalPriceKeys("PARA", "2022-10-12").indexOf("Q12:LEGACY:PARA") > historicalPriceKeys("PARA", "2022-10-12").indexOf("WIKI:PARA"));
});


test("同一普通股连续性和不同股类、同名旧发行人必须分开", async () => {
  const { historicalPriceTicker } = await import("./membership");
  assert.equal(historicalPriceTicker("BBT", "2017-11-08"), "TFC");
  assert.equal(historicalPriceTicker("STI", "2017-11-08"), "STI");
  assert.equal(historicalPriceTicker("BHGE", "2017-11-08"), "BKR");
  assert.equal(historicalPriceTicker("TMK", "2017-11-08"), "GL");
  assert.equal(historicalPriceTicker("IR", "2017-11-08"), "TT");
  assert.equal(historicalPriceTicker("IR", "2022-10-12"), "IR");
  assert.equal(historicalPriceTicker("TT", "2007-01-03"), "LEGACY:TT");
  assert.equal(historicalPriceTicker("TT", "2022-10-12"), "TT");
  assert.equal(historicalPriceTicker("CBS", "2017-11-08"), "LEGACY:PARA");
  assert.equal(historicalPriceTicker("VIAB", "2017-11-08"), "VIAB");
  assert.equal(historicalPriceTicker("DISCA", "2020-04-03"), "WBD");
  assert.equal(historicalPriceTicker("DISCK", "2020-04-03"), "DISCK");
});

test("DeVry、Wyndham和JDSU的历史更名行情与复用代码按日期隔离", async () => {
  const { historicalPriceTicker } = await import("./membership");
  assert.equal(historicalPriceTicker("ATGE", "2011-11-23"), "CVSA");
  assert.equal(historicalPriceTicker("DV", "2011-11-23"), "CVSA");
  assert.equal(historicalPriceTicker("DV", "2022-01-03"), "DV");
  assert.equal(historicalPriceTicker("WYND", "2010-01-04"), "TNL");
  assert.equal(historicalPriceTicker("WYN", "2010-01-04"), "TNL");
  assert.equal(historicalPriceTicker("JDSU", "2010-01-04"), "VIAV");
  assert.equal(historicalPriceTicker("VIAV", "2010-01-04"), "VIAV");
});

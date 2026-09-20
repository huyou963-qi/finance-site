import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRED_RELEASE_IDS_BY_PACKAGE,
  FRED_RELEASE_NAMES,
  allRegisteredFredReleaseIds,
  fredReleaseIdsForPackage,
  packageUsesFredReleaseCalendar,
} from "./catalog";
import type { FredReleaseCalendar } from "./client";
import {
  fredReleaseAtFromDate,
  fredReleaseOccurrencesForPackage,
  fredReleaseToCalendarEvent,
  lastFredReleaseBefore,
  nextFredRelease,
} from "./parseCalendar";

function calendar(entries: Record<number, string[]>): FredReleaseCalendar {
  const datesByRelease = new Map<number, string[]>();
  let rowCount = 0;
  for (const [id, dates] of Object.entries(entries)) {
    datesByRelease.set(Number(id), [...dates].sort());
    rowCount += dates.length;
  }
  return { datesByRelease, rowCount, failedReleaseIds: [] };
}

test("发布日 → UTC：夏令时与冬令时各自正确", () => {
  // 2026-09-16 美东是 EDT (UTC-4)：8:30 ET = 12:30 UTC
  assert.equal(fredReleaseAtFromDate("2026-09-16")?.toISOString(), "2026-09-16T12:30:00.000Z");
  // 2026-12-16 美东是 EST (UTC-5)：8:30 ET = 13:30 UTC
  assert.equal(fredReleaseAtFromDate("2026-12-16")?.toISOString(), "2026-12-16T13:30:00.000Z");
  assert.equal(fredReleaseAtFromDate("不是日期"), null);
  // 越界值必须拒绝，不能被静默进位（2026-13-99 会变成 2027-04-09）
  assert.equal(fredReleaseAtFromDate("2026-13-99"), null);
  assert.equal(fredReleaseAtFromDate("2026-02-30"), null);
  assert.equal(fredReleaseAtFromDate("2026-00-10"), null);
  // 闰日是合法的
  assert.equal(fredReleaseAtFromDate("2028-02-29")?.toISOString(), "2028-02-29T13:30:00.000Z");
});

test("MTIS（release 25）真实发布日展开与前后定位", () => {
  const cal = calendar({
    25: ["2026-08-14", "2026-09-16", "2026-10-15", "2026-11-17", "2026-12-16"],
  });
  const occ = fredReleaseOccurrencesForPackage(cal, "us.census.mtis");
  assert.equal(occ.length, 5);
  assert.deepEqual(
    occ.map((o) => o.releaseAt.toISOString()),
    [
      "2026-08-14T12:30:00.000Z",
      "2026-09-16T12:30:00.000Z",
      "2026-10-15T12:30:00.000Z",
      "2026-11-17T13:30:00.000Z",
      "2026-12-16T13:30:00.000Z",
    ],
  );

  const now = new Date("2026-09-20T09:00:00.000Z");
  assert.equal(nextFredRelease(occ, now)?.date, "2026-10-15");
  // 这正是 TE 给不出、而补抓判定必须依赖的信息
  assert.equal(lastFredReleaseBefore(occ, now)?.date, "2026-09-16");
});

test("刚发布 6 秒：next 仍指向本期（60 秒宽限），last 已能看到本期", () => {
  const cal = calendar({ 25: ["2026-09-16", "2026-10-15"] });
  const occ = fredReleaseOccurrencesForPackage(cal, "us.census.mtis");
  const justAfter = new Date("2026-09-16T12:30:06.000Z");
  assert.equal(nextFredRelease(occ, justAfter)?.date, "2026-09-16");
  assert.equal(lastFredReleaseBefore(occ, justAfter)?.date, "2026-09-16");
});

test("跨多个 release 的发布包取并集并按时间排序", () => {
  // us.fed.fomc 成员分属 release 18 (H.15) 与 101 (FOMC Press Release)
  assert.deepEqual([...fredReleaseIdsForPackage("us.fed.fomc")!].sort((a, b) => a - b), [18, 101]);
  const cal = calendar({
    18: ["2026-10-05", "2026-10-13"],
    101: ["2026-10-28"],
  });
  const occ = fredReleaseOccurrencesForPackage(cal, "us.fed.fomc");
  assert.deepEqual(occ.map((o) => `${o.releaseId}@${o.date}`), [
    "18@2026-10-05",
    "18@2026-10-13",
    "101@2026-10-28",
  ]);
  // 任一成员 release 发布即到期
  assert.equal(nextFredRelease(occ, new Date("2026-10-01T00:00:00Z"))?.date, "2026-10-05");
});

test("日历里没有该 release 的数据时返回空，调用方据此回退", () => {
  const occ = fredReleaseOccurrencesForPackage(calendar({ 999: ["2026-10-01"] }), "us.census.mtis");
  assert.deepEqual(occ, []);
  assert.equal(nextFredRelease(occ, new Date()), null);
  assert.equal(lastFredReleaseBefore(occ, new Date()), null);
});

test("未注册的发布包不走 FRED 日历", () => {
  assert.equal(packageUsesFredReleaseCalendar("us.census.mtis"), true);
  assert.equal(packageUsesFredReleaseCalendar("us.ism.manufacturing"), false);
  assert.equal(packageUsesFredReleaseCalendar("cn.nbs.cpi"), false);
  assert.equal(fredReleaseIdsForPackage("不存在的包"), null);
});

test("生成的事件带可追溯的 eventId 与人类可读标题", () => {
  const cal = calendar({ 10: ["2026-10-14"] });
  const occ = fredReleaseOccurrencesForPackage(cal, "us.bls.cpi");
  const event = fredReleaseToCalendarEvent(occ[0]!);
  assert.equal(event.eventId, "fred-release:10:2026-10-14");
  assert.equal(event.title, "Consumer Price Index");
  assert.equal(event.countryCode, "US");
  assert.equal(event.releaseAt.toISOString(), "2026-10-14T12:30:00.000Z");
});

test("注册表自洽：非空、去重、每个 release id 都有名字", () => {
  const packages = Object.keys(FRED_RELEASE_IDS_BY_PACKAGE);
  assert.ok(packages.length >= 55, `发布包数量异常：${packages.length}`);
  for (const [pkg, ids] of Object.entries(FRED_RELEASE_IDS_BY_PACKAGE)) {
    assert.ok(ids.length > 0, `${pkg} 没有 release id`);
    assert.equal(new Set(ids).size, ids.length, `${pkg} 的 release id 有重复`);
    for (const id of ids) {
      assert.ok(Number.isInteger(id) && id > 0, `${pkg} 的 release id 非法：${id}`);
      assert.ok(FRED_RELEASE_NAMES[id], `release ${id} 缺少名称`);
    }
  }
  const all = allRegisteredFredReleaseIds();
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(all, [...all].sort((a, b) => a - b));
});

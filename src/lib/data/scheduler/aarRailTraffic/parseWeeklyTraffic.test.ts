import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  parseAarArchiveListPage,
  parseAarArchiveMaxPage,
  parseAarWeeklyReleasePage,
} from "./parseWeeklyTraffic";

const FIXTURE_LIST = path.join(
  process.cwd(),
  ".data/aar-weekly-traffic-archive-page1-sample.html",
);
const FIXTURE_WEEK_2026 = path.join(
  process.cwd(),
  ".data/aar-weekly-traffic-week-sample.html",
);
const FIXTURE_WEEK_2019 = path.join(
  process.cwd(),
  ".data/aar-weekly-traffic-week-2019-sample.html",
);

describe("parseAarArchiveListPage", () => {
  it("解析归档列表第 1 页（fixture 核实：10 条，含 2026-08-29 最新一条）", () => {
    const html = fs.readFileSync(FIXTURE_LIST, "utf-8");
    const items = parseAarArchiveListPage(html);
    assert.equal(items.length, 10);
    assert.equal(
      items[0]!.url,
      "https://www.aar.org/news/aar-reports-weekly-rail-traffic-for-the-week-ending-august-29-2026/",
    );
    assert.equal(items[0]!.weekEndingDate?.toISOString().slice(0, 10), "2026-08-29");
  });

  it("空列表（无 news-item）时 throw", () => {
    assert.throws(
      () => parseAarArchiveListPage("<html><body>no items</body></html>"),
      /0 个条目/,
    );
  });

  it("解析最大分页页码", () => {
    const html = fs.readFileSync(FIXTURE_LIST, "utf-8");
    assert.equal(parseAarArchiveMaxPage(html), 51);
  });
});

describe("parseAarWeeklyReleasePage", () => {
  it("解析 2026-08-22 当周正文（fixture 核实）", () => {
    const html = fs.readFileSync(FIXTURE_WEEK_2026, "utf-8");
    const parsed = parseAarWeeklyReleasePage(html);
    assert.equal(parsed.weekEndingDate.toISOString().slice(0, 10), "2026-08-22");
    assert.equal(parsed.carloads, 235_885);
    assert.equal(parsed.intermodal, 296_577);
  });

  it("解析 2019-03-23 当周正文（跨 7 年格式稳定性核实）", () => {
    const html = fs.readFileSync(FIXTURE_WEEK_2019, "utf-8");
    const parsed = parseAarWeeklyReleasePage(html);
    assert.equal(parsed.weekEndingDate.toISOString().slice(0, 10), "2019-03-23");
    assert.equal(parsed.carloads, 236_817);
    assert.equal(parsed.intermodal, 266_200);
  });

  it("缺 week-ending 锚点时 throw", () => {
    assert.throws(
      () => parseAarWeeklyReleasePage("<p>no anchors here</p>"),
      /week-ending 日期锚点/,
    );
  });

  it("缺 carloads 锚点时 throw", () => {
    const html =
      "<p>reported U.S. rail traffic for the week ending August 22, 2026.</p>";
    assert.throws(() => parseAarWeeklyReleasePage(html), /carloads 锚点/);
  });

  it("缺 intermodal 锚点时 throw", () => {
    const html =
      "<p>reported U.S. rail traffic for the week ending August 22, 2026. Total carloads for the week ending August 22 were 235,885 carloads, up 3.2 percent.</p>";
    assert.throws(() => parseAarWeeklyReleasePage(html), /intermodal 锚点/);
  });

  it("未来日期时 throw", () => {
    const html =
      "<p>reported U.S. rail traffic for the week ending August 22, 2999. Total carloads for the week ending August 22 were 235,885 carloads. U.S. weekly intermodal volume was 296,577 containers and trailers.</p>";
    assert.throws(() => parseAarWeeklyReleasePage(html), /未来日期/);
  });
});

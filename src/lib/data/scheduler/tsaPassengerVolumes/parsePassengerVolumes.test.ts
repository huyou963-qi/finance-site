import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseTsaPassengerVolumesPage } from "./parsePassengerVolumes";

const FIXTURE_CURRENT = path.join(
  process.cwd(),
  ".data/tsa-passenger-volumes-current-sample.html",
);
const FIXTURE_2019 = path.join(
  process.cwd(),
  ".data/tsa-passenger-volumes-2019-sample.html",
);

describe("parseTsaPassengerVolumesPage", () => {
  it("解析当年滚动窗口页面（fixture 核实：起 2026-01-01，最新 2026-09-02）", () => {
    const html = fs.readFileSync(FIXTURE_CURRENT, "utf-8");
    const { points, latestObsDate, skippedInvalid } = parseTsaPassengerVolumesPage(html);
    assert.equal(skippedInvalid, 0);
    assert.ok(points.length > 200);
    assert.equal(points[0]!.obsDate.toISOString().slice(0, 10), "2026-01-01");
    assert.equal(latestObsDate?.toISOString().slice(0, 10), "2026-09-02");
    const latest = points[points.length - 1]!;
    assert.equal(latest.obsDate.toISOString().slice(0, 10), "2026-09-02");
    assert.equal(latest.value, 2_050_689);
  });

  it("解析 2019 年度归档页（fixture 核实：全年 365 天）", () => {
    const html = fs.readFileSync(FIXTURE_2019, "utf-8");
    const { points, skippedInvalid } = parseTsaPassengerVolumesPage(html);
    assert.equal(skippedInvalid, 0);
    assert.equal(points.length, 365);
    assert.equal(points[0]!.obsDate.toISOString().slice(0, 10), "2019-01-01");
    assert.equal(points[0]!.value, 2_201_765);
    assert.equal(
      points[points.length - 1]!.obsDate.toISOString().slice(0, 10),
      "2019-12-31",
    );
  });

  it("表头缺失 Date/Numbers 时 throw（锚点缺失变体）", () => {
    const html = "<table><tr><th>Foo</th><th>Bar</th></tr><tr><td>1</td><td>2</td></tr></table>";
    assert.throws(() => parseTsaPassengerVolumesPage(html), /未找到表头/);
  });

  it("0 个有效行时 throw", () => {
    const html =
      '<table><tr><th>Date</th><th>Numbers</th></tr><tr><td>not-a-date</td><td>abc</td></tr></table>';
    assert.throws(() => parseTsaPassengerVolumesPage(html), /0 个有效点/);
  });

  it("未来日期时 throw", () => {
    const html =
      '<table><tr><th>Date</th><th>Numbers</th></tr><tr><td>1/1/2999</td><td>1,000,000</td></tr></table>';
    assert.throws(() => parseTsaPassengerVolumesPage(html), /未来日期/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseGaccMonthlyIndex } from "./parseMonthlyIndex";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf-8");

describe("parseGaccMonthlyIndex", () => {
  it("当年索引页：只取已发布月份的 <a>，未发布月份是 <span>（fixture 核实：2026 到 7 月）", () => {
    const html = fixture("gacc-monthly-index-2026-sample.html");
    const exports = parseGaccMonthlyIndex(html, "export");
    assert.deepEqual(exports.map((l) => l.month), [1, 2, 3, 4, 5, 6, 7]);
    assert.match(exports[0]!.url, /^http:\/\/english\.customs\.gov\.cn\/Statics\/[0-9a-f-]+\.html$/);

    const imports = parseGaccMonthlyIndex(html, "import");
    assert.deepEqual(imports.map((l) => l.month), [1, 2, 3, 4, 5, 6, 7]);
    assert.notEqual(exports[0]!.url, imports[0]!.url, "表(13)与表(14)必须取到不同链接");
  });

  it("归档年索引页：标签间有换行缩进、表号带空格也要能匹配（fixture 核实：2018 全 12 月）", () => {
    const html = fixture("gacc-monthly-index-2018-sample.html");
    assert.equal(parseGaccMonthlyIndex(html, "export").length, 12);
    assert.equal(parseGaccMonthlyIndex(html, "import").length, 12);
  });

  it("找不到目标表行时 throw", () => {
    const html = fixture("gacc-monthly-index-2026-sample.html").replace(
      /Major Export Commodities in Quantity and Value/g,
      "Something Else",
    );
    assert.throws(() => parseGaccMonthlyIndex(html, "export"), /未找到表\(13\)/);
  });

  it("目标行内 0 个月份链接时 throw", () => {
    const html =
      "<table><tr><td>（13）Major Export Commodities in Quantity and Value</td>" +
      "<td><span>Jan.</span></td></tr></table>";
    assert.throws(() => parseGaccMonthlyIndex(html, "export"), /0 个月份链接/);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseJpMetiRetailFileList } from "./discovery";

const row = `<div>調査年月 2026年 公開（更新）日 2026-08-17 <a href="/stat-search/files?layout=datalist&amp;stat_infid=000031387992">業種別商業販売額及び前年（度、同期、同月）比</a></div>`;

test("discovers the exact current e-Stat METI workbook", () => {
  assert.deepEqual(parseJpMetiRetailFileList(row), {
    statInfId: "000031387992",
    surveyYear: 2026,
    releaseDate: "2026-08-17",
    downloadUrl: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031387992&fileKind=0",
  });
});

test("discovers survey year and release date across the current responsive markup", () => {
  const currentMarkup = `<article><a href="/stat-search/files?stat_infid=000031387992">${
    "業種別商業販売額及び前年（度、同期、同月）比"
  }</a><div><span>調査年月&nbsp;&nbsp;</span> 2026年</div><div><span>公開（更新）日&nbsp;&nbsp;</span>2026-08-17</div></article>`;
  assert.equal(parseJpMetiRetailFileList(currentMarkup).surveyYear, 2026);
  assert.equal(parseJpMetiRetailFileList(currentMarkup).releaseDate, "2026-08-17");
});

test("missing or duplicate exact titles fail closed", () => {
  assert.throws(() => parseJpMetiRetailFileList("<html>none</html>"));
  assert.throws(() => parseJpMetiRetailFileList(row + row));
});

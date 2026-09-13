import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";
import { JP_CAO_WATCHERS_SERIES } from "./catalog";
import { parseJpCaoWatchersIndexPage, parseJpCaoWatchersWorkbook } from "./parser";

const asOf = new Date("2026-09-13T00:00:00Z");
const fixture = readFileSync(new URL("./fixtures/watcher5.xls", import.meta.url));
const indexFixture = readFileSync(new URL("./fixtures/index.html", import.meta.url), "utf8");

function mutate(edit: (workbook: XLSX.WorkBook) => void): Buffer {
  const workbook = XLSX.read(fixture, { type: "buffer" });
  edit(workbook);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("discovers the one official seasonally adjusted workbook", () => {
  assert.equal(parseJpCaoWatchersIndexPage(indexFixture), "https://www5.cao.go.jp/keizai3/watcher/watcher5.xls");
  assert.throws(() => parseJpCaoWatchersIndexPage(indexFixture.replace("全国の分野・業種別、地域別ＤＩの推移", "other")));
  assert.throws(() => parseJpCaoWatchersIndexPage(indexFixture + indexFixture));
});

test("parses eight national current/outlook DI histories", () => {
  const parsed = parseJpCaoWatchersWorkbook(fixture, asOf);
  assert.equal(Object.keys(parsed.series).length, 8);
  assert.equal(parsed.sourceLatestObsDate.toISOString(), "2026-08-01T00:00:00.000Z");
  for (const target of JP_CAO_WATCHERS_SERIES) {
    const points = parsed.series[target.instrumentCode];
    assert.equal(points.length, 296);
    assert.equal(points[0].obsDate.toISOString(), "2002-01-01T00:00:00.000Z");
    assert.equal(points.at(-1)!.obsDate.toISOString(), "2026-08-01T00:00:00.000Z");
  }
  assert.equal(parsed.series.cao_jp_watchers_current_total_di_sa.at(-1)!.value, 46.4);
  assert.equal(parsed.series.cao_jp_watchers_outlook_total_di_sa.at(-1)!.value, 48.3);
  assert.equal(parsed.series.cao_jp_watchers_current_employment_di_sa.at(-1)!.value, 48.8);
});

test("fails closed on a missing sheet or changed scope/header", () => {
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    delete workbook.Sheets["分野別（先行き)"];
    workbook.SheetNames = workbook.SheetNames.filter((name) => name !== "分野別（先行き)");
  }), asOf));
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（現状）"].B1.v = "原数値";
  }), asOf));
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（現状）"].E4.v = "別分類";
  }), asOf));
});

test("fails closed on unknown values, a date gap, duplicate or future month", () => {
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（現状）"].D7.v = "-";
  }), asOf));
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（現状）"].C8.v = 3;
  }), asOf));
  assert.throws(() => parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（先行き)"].C8.v = 1;
  }), asOf));
  assert.throws(() => parseJpCaoWatchersWorkbook(fixture, new Date("2026-07-01T00:00:00Z")));
});

test("returns old seasonal revisions instead of slicing to recent months", () => {
  const revised = parseJpCaoWatchersWorkbook(mutate((workbook) => {
    workbook.Sheets["分野別（現状）"].D7.v = 35.5;
  }), asOf);
  assert.equal(revised.series.cao_jp_watchers_current_total_di_sa[0].value, 35.5);
  assert.equal(revised.series.cao_jp_watchers_current_total_di_sa.length, 296);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseHousingStartsTimeSeries } from "./housingStartsTimeSeries";

type Row = unknown[];

const header: Row[] = [
  [null, "新設住宅着工：利用関係別戸数，床面積　"],
  [],
  [null, "総計"],
  [null, null, null, null, null, "持家", null, null, null, "貸家", null, "給与住宅", null, "分譲住宅"],
  [null, "　", null, null, null, null, null, "住宅金融機構"],
  [null, "　", null, "床面積", null, "　"],
  [null, "戸数", "前年比", null, "前年比", "戸数", "前年比", "戸数", "前年比", "戸数", "前年比", "戸数", "前年比", "戸数"],
  ["令和 7 年度", 711171, -12.9, 54568.132], // 年度汇总行，必须跳过
];

function monthRow(label: unknown, total: number): Row {
  // 总户数、床面积(千㎡)、持家、贷家、分让
  return [label, total, null, total / 10, null, total / 4, null, null, null, total / 2, null, 1, null, total / 5];
}

/** 从 S40 年 1 月起逐月造行：年初（或换元）行带完整标签，其余只写月份数字 */
function buildRows(endYear: number, endMonth: number): Row[] {
  const rows: Row[] = [...header];
  for (let y = 1965; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === endYear && m > endMonth) break;
      let label: unknown = m;
      if (m === 1 || (y === 2019 && m === 5)) {
        const [era, base] = y > 2019 || (y === 2019 && m >= 5) ? ["R", 2018] : y >= 1989 ? ["H", 1988] : ["S", 1925];
        label = `${era}${String(y - base).replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)))}年 ${m}月`;
      }
      // 源文件个别月份写成字符串（2012-05/06 是 "5"、"6"）
      if (y === 2012 && (m === 5 || m === 6)) label = String(m);
      rows.push(monthRow(label, 60000 + y));
    }
  }
  rows.push(["※１３ヵ月以前のデータを非表示にしております。"]);
  rows.push([2, 1, 1]); // 注释之后的杂项不能被当成月份
  return rows;
}

function workbook(rows: Row[]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "jyuu");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("解析 1965-01 → 最新月，跨昭和/平成/令和换元，床面积千㎡换算为㎡", () => {
  const out = parseHousingStartsTimeSeries(workbook(buildRows(2026, 7)));
  const total = out.total;
  assert.equal(total[0]!.obsDate.toISOString().slice(0, 10), "1965-01-01");
  assert.equal(total.at(-1)!.obsDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(total.length, (2026 - 1965) * 12 + 7);
  const may2019 = total.find((p) => p.obsDate.toISOString().startsWith("2019-05"))!;
  assert.equal(may2019.value, 62019);
  assert.equal(out.floor_area.at(-1)!.value, ((60000 + 2026) / 10) * 1000);
  assert.equal(out.rental.at(-1)!.value, (60000 + 2026) / 2);
  assert.equal(out.for_sale.at(-1)!.value, (60000 + 2026) / 5);
});

test("月份不连续时报错而不是静默错位", () => {
  const rows = buildRows(2026, 7);
  rows.splice(header.length + 30, 1);
  assert.throws(() => parseHousingStartsTimeSeries(workbook(rows)), /不连续/);
});

test("表头结构变化时报错", () => {
  const rows = buildRows(2026, 7);
  rows[3] = [null, null, null, null, null, "貸家"];
  assert.throws(() => parseHousingStartsTimeSeries(workbook(rows)), /表头结构/);
});

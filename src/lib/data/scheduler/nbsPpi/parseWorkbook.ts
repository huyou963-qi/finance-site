import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import { NBS_PPI_COMPONENTS, nbsPpiCode } from "./catalog";
const norm = (v: unknown) => String(v ?? "").replace(/\s|　/g, "").replace(/^[一二三]、/, "");
const alias = (v: string) => v === "酒、饮料及精制茶制造业" ? "酒、饮料和精制茶制造业" : v;
function numeric(v: unknown) {
  if (v === null || v === undefined || String(v).trim() === "") throw new Error("国家统计局 PPI：空值不是零");
  const n = Number(v);
  if (!Number.isFinite(n) || n < -100 || n > 200) throw new Error(`国家统计局 PPI：非法涨跌幅 ${String(v)}`);
  return n;
}
/** Published output prices only; input prices and YTD changes are not substitutes. */
export function parseNbsPpiWorkbook(wb: XLSX.WorkBook) {
  const candidates = wb.SheetNames.map(name => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null }))
    .filter(rows => /工业生产者价格主要数据/.test(String(rows[0]?.[0])));
  if (candidates.length !== 1) throw new Error("国家统计局 PPI：缺少或重复主要数据表");
  const rows = candidates[0]!, date = /^(20\d{2})年(\d{1,2})月/.exec(norm(rows[0]?.[0]));
  if (!date || Number(date[2]) < 1 || Number(date[2]) > 12) throw new Error("国家统计局 PPI：非法观测月份");
  const obsDate = new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, 1));
  const now = new Date();
  if (obsDate > new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) throw new Error("国家统计局 PPI：未来观测月份");
  const header = rows.findIndex(r => norm(r[1]).startsWith("环比涨跌幅") && norm(r[2]).startsWith("同比涨跌幅"));
  const outputStart = rows.findIndex(r => norm(r[0]) === "工业生产者出厂价格"), inputStart = rows.findIndex(r => norm(r[0]) === "工业生产者购进价格"), industriesStart = rows.findIndex(r => norm(r[0]) === "主要行业出厂价格");
  if (header < 0 || outputStart <= header || inputStart <= outputStart || industriesStart <= inputStart) throw new Error("国家统计局 PPI：表头/出厂与购进分区发生变化");
  if (![1, 2].every(col => (norm(rows[header]?.[col]) + norm(rows[header + 1]?.[col])).includes("%"))) throw new Error("国家统计局 PPI：涨跌幅单位不是百分数");
  const pointsByInstrument = new Map<string, ObservationPoint[]>();
  for (const c of NBS_PPI_COMPONENTS) {
    const section = c.group === "aggregate" ? rows.slice(outputStart, inputStart) : rows.slice(industriesStart + 1);
    const matches = section.filter(r => norm(r[0]) === alias(c.displayName));
    if (matches.length > 1) throw new Error(`国家统计局 PPI：重复行 ${c.displayName}`);
    if (!matches.length) {
      if (c.group === "aggregate") throw new Error(`国家统计局 PPI：缺少总项 ${c.displayName}`);
      continue; // The official release only selects some of the 41 industries.
    }
    const row = matches[0]!, mom = numeric(row[1]), yoy = numeric(row[2]);
    pointsByInstrument.set(nbsPpiCode(c.key, "mom"), [{ obsDate, value: mom }]);
    pointsByInstrument.set(nbsPpiCode(c.key, "yoy"), [{ obsDate, value: yoy }]);
    pointsByInstrument.set(nbsPpiCode(c.key, "index"), [{ obsDate, value: Number((100 + yoy).toFixed(10)) }]);
  }
  return { pointsByInstrument, sourceLatestObsDate: obsDate };
}

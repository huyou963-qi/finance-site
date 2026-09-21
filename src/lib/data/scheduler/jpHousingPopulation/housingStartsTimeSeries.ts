import * as XLSX from "xlsx";
import { list, record, requestEStat } from "../eStat/client";
import type { ObservationPoint } from "../types";

/**
 * 国土交通省「住宅着工統計 時系列表（月次）」——【住宅】利用関係別 戸数（含床面積）。
 *
 * 为什么不用 e-Stat 数据库表（statsDataId 0003114514）：住宅着工统计的 DB 表**一年只批量更新一次**
 * （2026-01-20 更新后仍只到 2024-12），调度器每天「成功」却永远拿不到新月份。
 * 国交省每月把时系列 Excel 放在 e-Stat 文件区（统计代码 00600120），当月末即更新到上月。
 * 2026-09 实测该文件 2011-01 → 2024-12 与 DB 表逐值相等（床面积文件单位为千㎡）。
 *
 * 文件是按列排的左右两块，左块为原值（未季调）：
 *   col1 总户数、col3 床面积（千㎡）、col5 持家、col9 贷家、col13 分让住宅。
 * 月度行从「S４０年 １月」起：年初行带「元号+年+月」，其余行有时只写月份数字。
 */
export type HousingStartsColumn = "total" | "floor_area" | "owner_occupied" | "rental" | "for_sale";

const COLUMN_INDEX: Record<HousingStartsColumn, number> = {
  total: 1,
  floor_area: 3,
  owner_occupied: 5,
  rental: 9,
  for_sale: 13,
};

/** 文件里床面积单位为千㎡，库内沿用 e-Stat DB 表的 ㎡ */
const COLUMN_SCALE: Record<HousingStartsColumn, number> = {
  total: 1,
  floor_area: 1000,
  owner_occupied: 1,
  rental: 1,
  for_sale: 1,
};

const ERA_BASE: Record<string, number> = { S: 1925, H: 1988, R: 2018 };

function text(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, "");
}

function assertSchema(rows: unknown[][]): void {
  const cell = (r: number, c: number) => text(rows[r]?.[c]);
  const ok =
    /利用関係別戸数/.test(cell(0, 1)) &&
    cell(3, 5) === "持家" &&
    cell(3, 9) === "貸家" &&
    cell(3, 13) === "分譲住宅" &&
    cell(5, 3) === "床面積" &&
    cell(6, 1) === "戸数";
  if (!ok) throw new Error("住宅着工時系列表（利用関係別）表头结构变了");
}

/** 解析整本工作簿 → 各列的月度序列（按日期升序、逐月连续） */
export function parseHousingStartsTimeSeries(buffer: Buffer): Record<HousingStartsColumn, ObservationPoint[]> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error("住宅着工時系列表缺工作表");
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
  assertSchema(rows);

  const out = Object.fromEntries(
    (Object.keys(COLUMN_INDEX) as HousingStartsColumn[]).map((k) => [k, [] as ObservationPoint[]]),
  ) as Record<HousingStartsColumn, ObservationPoint[]>;
  let year: number | null = null;
  let prev: number | null = null; // 上一行的 UTC 月份序号 year*12+month
  for (const row of rows) {
    const label = row[0];
    let month: number | null = null;
    const m = /^([SHR])(\d+|元)年(\d{1,2})月$/.exec(text(label));
    if (m) {
      year = ERA_BASE[m[1]!]! + (m[2] === "元" ? 1 : Number(m[2]));
      month = Number(m[3]);
    } else if (year !== null && /^\d{1,2}$/.test(text(label))) {
      // 只写月份的行：多数是数字，个别是字符串（2012-05/06 就是 "5"、"6"）
      month = Number(text(label));
    } else if (year !== null && /^※/.test(text(label))) {
      break;
    } else {
      continue;
    }
    if (month < 1 || month > 12) throw new Error(`住宅着工時系列表月份越界：${String(label)}`);
    const seq = year! * 12 + month - 1;
    if (prev !== null && seq !== prev + 1) {
      throw new Error(`住宅着工時系列表月份不连续：${String(label)}（上一行 ${Math.floor(prev / 12)}-${(prev % 12) + 1}）`);
    }
    prev = seq;
    const obsDate = new Date(Date.UTC(year!, month - 1, 1));
    for (const [key, col] of Object.entries(COLUMN_INDEX) as [HousingStartsColumn, number][]) {
      const v = row[col];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) continue;
      out[key].push({ obsDate, value: Math.round(v * COLUMN_SCALE[key] * 1000) / 1000 });
    }
  }
  if (out.total.length < 600) throw new Error(`住宅着工時系列表月度行过少（${out.total.length}）`);
  return out;
}

const DATASET_TITLE = /^住宅着工統計_時系列表_月次_(\d{4})年(\d{1,2})月$/;

/** 用 e-Stat 数据目录 API 找最新一期时系列表里「利用関係別 戸数」文件的下载地址 */
export async function discoverHousingStartsTimeSeriesUrl(): Promise<{ url: string; period: string }> {
  const json = await requestEStat("getDataCatalog", {
    statsCode: "00600120",
    dataType: "XLS",
    // searchWord 不匹配带下划线的完整标题，按「時系列表」搜再用标题正则筛
    searchWord: "時系列表",
    limit: 100,
  });
  const datasets = list(record(record(json.GET_DATA_CATALOG).DATA_CATALOG_LIST_INF).DATA_CATALOG_INF);
  let best: { url: string; period: string; seq: number } | null = null;
  for (const ds of datasets) {
    const title = String(record(record(ds.DATASET).TITLE).NAME ?? "").trim();
    const m = DATASET_TITLE.exec(title);
    if (!m) continue;
    const seq = Number(m[1]) * 12 + Number(m[2]);
    const resource = list(record(ds.RESOURCES).RESOURCE).find((r) =>
      /利用関係別\s*戸数/.test(String(record(r.TITLE).NAME ?? "").normalize("NFKC")),
    );
    const url = resource ? String(resource.URL ?? "") : "";
    if (url && (!best || seq > best.seq)) best = { url, period: `${m[1]}-${m[2]!.padStart(2, "0")}`, seq };
  }
  if (!best) throw new Error("e-Stat 数据目录里找不到「住宅着工統計_時系列表_月次」的利用関係別戸数文件");
  return { url: best.url, period: best.period };
}

let cached: { at: number; value: Record<HousingStartsColumn, ObservationPoint[]> } | null = null;

/** 下载并解析（进程内缓存 10 分钟：同包 5 条序列只下一次） */
export async function fetchHousingStartsTimeSeries(): Promise<Record<HousingStartsColumn, ObservationPoint[]>> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const { url } = await discoverHousingStartsTimeSeriesUrl();
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`住宅着工時系列表下载失败 HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const magic = buffer.subarray(0, 4).toString("hex");
  if (magic !== "d0cf11e0" && buffer.subarray(0, 2).toString() !== "PK") {
    throw new Error("住宅着工時系列表响应不是 Excel 文件");
  }
  const value = parseHousingStartsTimeSeries(buffer);
  cached = { at: Date.now(), value };
  return value;
}

export function isHousingStartsColumn(value: unknown): value is HousingStartsColumn {
  return typeof value === "string" && value in COLUMN_INDEX;
}

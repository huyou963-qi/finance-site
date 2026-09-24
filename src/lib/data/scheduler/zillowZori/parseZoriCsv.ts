import type { ObservationPoint } from "../types";

/**
 * 解析 ZORI Metro & U.S. CSV → 全美月度观测点。
 *
 * 结构（2026-09-24 实测）：表头 `RegionID,SizeRank,RegionName,RegionType,StateName,2015-01-31,…`，
 * 前 5 列为地区属性，其后每列一个月末日期；全美行 RegionName="United States"、
 * RegionType="country"（RegionID 102001）。月末日期归一到月首 `YYYY-MM-01`，与库内月频对齐。
 * 值为美元/月（典型租金），保留 2 位小数。
 *
 * 防御：表头不符、找不到全美行、0 个有效点一律 throw（源改版报错而非静默取错）；
 * 空单元格跳过（早期月份未覆盖时正常），非数字或越出 [300, 10000] 计入 skippedInvalid。
 */
const FIXED_COLUMNS = ["RegionID", "SizeRank", "RegionName", "RegionType", "StateName"];
const MIN_VALUE = 300;
const MAX_VALUE = 10_000;

export type ParsedZori = {
  points: ObservationPoint[];
  latestObsDate: Date | null;
  skippedInvalid: number;
};

/** 仅处理本文件用到的 CSV 形态：字段可带双引号（地区名含逗号），不含换行 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseZoriCsv(text: string): ParsedZori {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("ZORI：CSV 为空或只有表头");
  const header = splitCsvLine(lines[0]!);
  for (let i = 0; i < FIXED_COLUMNS.length; i++) {
    if (header[i] !== FIXED_COLUMNS[i]) {
      throw new Error(`ZORI：表头第 ${i + 1} 列应为 ${FIXED_COLUMNS[i]}，实际 ${header[i]}（源结构可能已变）`);
    }
  }
  const usLine = lines.slice(1).map(splitCsvLine).find((cells) => cells[2] === "United States" && cells[3] === "country");
  if (!usLine) throw new Error('ZORI：未找到 RegionName="United States" 且 RegionType="country" 的全美行');

  const points: ObservationPoint[] = [];
  let skippedInvalid = 0;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let col = FIXED_COLUMNS.length; col < header.length; col++) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(header[col]!.trim());
    if (!m) {
      skippedInvalid += 1;
      continue;
    }
    const raw = (usLine[col] ?? "").trim();
    if (raw === "") continue;
    const value = Number(raw);
    const obsDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
    if (!Number.isFinite(value) || value < MIN_VALUE || value > MAX_VALUE || obsDate.getTime() > todayUtc) {
      skippedInvalid += 1;
      continue;
    }
    points.push({ obsDate, value: Math.round(value * 100) / 100 });
  }
  if (points.length === 0) throw new Error("ZORI：全美行解析后 0 个有效点");
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return { points, latestObsDate: points[points.length - 1]!.obsDate, skippedInvalid };
}

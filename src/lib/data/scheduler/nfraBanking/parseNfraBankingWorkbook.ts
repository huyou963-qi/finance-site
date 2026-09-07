import * as XLSX from "xlsx";
import type { ObservationPoint } from "../types";
import {
  NFRA_BANKING_SERIES,
  type NfraBankingDataset,
  type NfraBankingSeriesConfig,
} from "./catalog";

/**
 * NFRA 银行业统计工作簿结构（2021—2026 fixtures）：
 *
 * - `bank_assets_monthly` / sheet `资产负债月度`：同一 sheet 依次列出银行业总计、
 *   商业银行和各机构类型。这里只解析 `1. 银行业金融机构` 到 `其中：商业银行合计`
 *   之间的首块；年份同时出现在标题和“时间”行，月份位于“项目”行。
 * - `commercial_bank_main_quarterly` / sheet `商业银行季度`：2021—2025 年份在标题，
 *   四个季度在“时间”行；2026 年标题不带年份，年份移到单独“时间”行、季度移到
 *   “项目”行。行名的缩进、半/全角括号和脚注星号不属于指标标识。
 *
 * 所有源百分比在 Excel 中均为小数（如 0.01518）；本解析器统一乘 100 后以 `%`
 * 入库。金额保持源工作簿的亿元原值。结构锚点、年份或必需指标行消失时直接 throw；
 * 单个坏值/未来观测期计入 skippedInvalid，不静默写入。
 */

export type ParsedNfraBankingWorkbook = {
  pointsBySeries: Map<string, ObservationPoint[]>;
  latestObsDateBySeries: Map<string, Date>;
  skippedInvalid: number;
};

const DATASET_SHEET: Record<NfraBankingDataset, string> = {
  bank_assets_monthly: "资产负债月度",
  commercial_bank_main_quarterly: "商业银行季度",
};

const TITLE_ANCHOR: Record<NfraBankingDataset, { label: string; pattern: RegExp }> = {
  bank_assets_monthly: {
    label: "银行业资产负债月度表",
    // 2024: “银行业金融机构资产负债情况表”；2025 年起标题增加“总资产、总负债（月度）”。
    pattern: /银行业(?:金融机构)?(?:总)?资产[、与]?总?负债(?:情况表|（月度）)/,
  },
  commercial_bank_main_quarterly: {
    label: "商业银行主要监管指标情况表",
    pattern: /商业银行主要监管指标情况表/,
  },
};

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\s\u3000]+/g, "").trim() : "";
}

function canonicalRowLabel(value: unknown): string {
  return compactText(value)
    .replace(/\(/g, "（")
    .replace(/\)/g, "）")
    .replace(/[＊*]+$/g, "");
}

function extractYears(value: unknown): number[] {
  const text = compactText(value);
  return [...text.matchAll(/(?:^|\D)((?:19|20)\d{2})年/g)].map((match) => Number(match[1]));
}

function parseNumeric(value: unknown): number | null | "invalid" {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : "invalid";
  if (typeof value !== "string") return "invalid";
  const text = value.trim();
  if (!text || /^(?:-|—|–|…|\.\.\.|n\/?a)$/i.test(text)) return null;
  const percentText = text.endsWith("%");
  const numeric = Number(text.replace(/,/g, "").replace(/%$/, ""));
  if (!Number.isFinite(numeric)) return "invalid";
  return percentText ? numeric / 100 : numeric;
}

function normalizeValue(
  raw: number,
  series: NfraBankingSeriesConfig,
): number | "invalid" {
  if (series.valueKind === "percent_fraction") {
    // 宽松值域只拦截错列/重复乘百分比；同比在极端年份允许为负。
    if (raw < -10 || raw > 10) return "invalid";
    return Math.round(raw * 100 * 1_000_000) / 1_000_000;
  }
  if (raw < -1_000_000_000 || raw > 1_000_000_000) return "invalid";
  return raw;
}

function assertCatalogIntegrity(): void {
  for (const field of ["seriesKey", "provider", "instrumentCode"] as const) {
    const seen = new Set<string>();
    for (const series of NFRA_BANKING_SERIES) {
      const value = series[field];
      if (seen.has(value)) throw new Error(`NFRA Banking：catalog 存在重复 ${field}: ${value}`);
      seen.add(value);
    }
  }
  const invalidCode = NFRA_BANKING_SERIES.find(
    (series) => !series.instrumentCode.startsWith("nfra_cn_"),
  );
  if (invalidCode) {
    throw new Error(`NFRA Banking：instrumentCode 缺少 nfra_cn_ 前缀: ${invalidCode.instrumentCode}`);
  }
}

function readRows(wb: XLSX.WorkBook, dataset: NfraBankingDataset): unknown[][] {
  const sheetName = DATASET_SHEET[dataset];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(
      `NFRA Banking：${dataset} 缺 sheet "${sheetName}"（实际：${wb.SheetNames.join(",")}）`,
    );
  }
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
}

function findTitleRow(rows: unknown[][], dataset: NfraBankingDataset): number {
  const anchor = TITLE_ANCHOR[dataset];
  const matches = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.some((cell) => anchor.pattern.test(compactText(cell))));
  if (matches.length !== 1) {
    throw new Error(
      `NFRA Banking：${dataset} 标题锚点“${anchor.label}”命中 ${matches.length} 次（应为 1 次）`,
    );
  }
  return matches[0]!.index;
}

function workbookYear(rows: unknown[][], titleRowIdx: number): number {
  const yearCandidates = new Set<number>();
  for (const cell of rows[titleRowIdx] ?? []) {
    for (const year of extractYears(cell)) yearCandidates.add(year);
  }
  for (const row of rows) {
    if (canonicalRowLabel(row[0]) !== "时间") continue;
    for (const cell of row) for (const year of extractYears(cell)) yearCandidates.add(year);
  }
  if (yearCandidates.size !== 1) {
    throw new Error(
      `NFRA Banking：工作簿年份无法唯一确定（候选：${[...yearCandidates].join(",") || "无"}）`,
    );
  }
  const year = [...yearCandidates][0]!;
  const currentYear = new Date().getUTCFullYear();
  if (year < 2000 || year > currentYear) {
    throw new Error(`NFRA Banking：工作簿年份异常或在未来：${year}`);
  }
  return year;
}

function emptyResult(dataset: NfraBankingDataset): ParsedNfraBankingWorkbook {
  return {
    pointsBySeries: new Map(
      NFRA_BANKING_SERIES.filter((series) => series.dataset === dataset).map((series) => [
        series.seriesKey,
        [],
      ]),
    ),
    latestObsDateBySeries: new Map(),
    skippedInvalid: 0,
  };
}

function addPoint(
  result: ParsedNfraBankingWorkbook,
  series: NfraBankingSeriesConfig,
  obsDate: Date,
  rawValue: unknown,
): void {
  const parsed = parseNumeric(rawValue);
  if (parsed == null) return;
  if (parsed === "invalid") {
    result.skippedInvalid += 1;
    return;
  }
  const value = normalizeValue(parsed, series);
  if (value === "invalid") {
    result.skippedInvalid += 1;
    return;
  }
  const points = result.pointsBySeries.get(series.seriesKey);
  if (!points) throw new Error(`NFRA Banking：未知 seriesKey ${series.seriesKey}`);
  if (points.some((point) => point.obsDate.getTime() === obsDate.getTime())) {
    throw new Error(`NFRA Banking：${series.seriesKey} 出现重复观测期 ${obsDate.toISOString()}`);
  }
  points.push({ obsDate, value });
  const latest = result.latestObsDateBySeries.get(series.seriesKey);
  if (!latest || obsDate > latest) result.latestObsDateBySeries.set(series.seriesKey, obsDate);
}

function assertRequiredPoints(
  result: ParsedNfraBankingWorkbook,
  dataset: NfraBankingDataset,
  year: number,
): void {
  for (const series of NFRA_BANKING_SERIES.filter(
    (item) => item.dataset === dataset && (item.availableFromYear ?? 0) <= year,
  )) {
    if ((result.pointsBySeries.get(series.seriesKey)?.length ?? 0) === 0) {
      throw new Error(
        `NFRA Banking：${dataset} 分项 ${series.sourceRowLabel} 解析后 0 个有效点`,
      );
    }
  }
  for (const points of result.pointsBySeries.values()) {
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  }
}

function parseMonthly(rows: unknown[][], titleRowIdx: number): ParsedNfraBankingWorkbook {
  const year = workbookYear(rows, titleRowIdx);
  const sectionStart = rows.findIndex(
    (row) => /^1[.．、]?银行业金融机构$/.test(canonicalRowLabel(row[0])),
  );
  if (sectionStart < 0) throw new Error("NFRA Banking：月度表缺“1. 银行业金融机构”分块锚点");
  const sectionEnd = rows.findIndex(
    (row, index) => index > sectionStart && canonicalRowLabel(row[0]) === "其中：商业银行合计",
  );
  if (sectionEnd < 0) throw new Error("NFRA Banking：月度表缺“其中：商业银行合计”分块终点");

  const headerIdx = rows.findIndex(
    (row, index) =>
      index > sectionStart &&
      index < sectionEnd &&
      canonicalRowLabel(row[0]) === "项目" &&
      row.some((cell) => canonicalRowLabel(cell) === "1月"),
  );
  if (headerIdx < 0) throw new Error("NFRA Banking：月度表缺月份“项目”表头");
  const header = rows[headerIdx]!;
  const monthCols = new Map<number, number>();
  for (let col = 1; col < header.length; col++) {
    const match = /^(\d{1,2})月$/.exec(canonicalRowLabel(header[col]));
    if (!match) continue;
    const month = Number(match[1]);
    if (month < 1 || month > 12 || monthCols.has(month)) {
      throw new Error(`NFRA Banking：月度表月份表头异常或重复：${canonicalRowLabel(header[col])}`);
    }
    monthCols.set(month, col);
  }
  if (monthCols.size !== 12) {
    throw new Error(`NFRA Banking：月度表月份列应为 12 列，实际 ${monthCols.size} 列`);
  }

  const block = rows.slice(headerIdx + 1, sectionEnd);
  const assetOffset = block.findIndex((row) => canonicalRowLabel(row[0]) === "总资产");
  const liabilityOffset = block.findIndex((row) => canonicalRowLabel(row[0]) === "总负债");
  if (assetOffset < 0 || liabilityOffset < 0 || assetOffset >= liabilityOffset) {
    throw new Error("NFRA Banking：月度表总资产/总负债行锚点缺失或顺序异常");
  }
  const assetYoyOffset = block.findIndex(
    (row, index) =>
      index > assetOffset &&
      index < liabilityOffset &&
      canonicalRowLabel(row[0]) === "比上年同期增长率",
  );
  const liabilityYoyOffsets = block
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row, index }) =>
        index > liabilityOffset && canonicalRowLabel(row[0]) === "比上年同期增长率",
    );
  if (assetYoyOffset < 0 || liabilityYoyOffsets.length !== 1) {
    throw new Error("NFRA Banking：月度表资产/负债同比行锚点缺失或重复");
  }

  const rowByKey = new Map<string, unknown[]>([
    ["banking_total_assets", block[assetOffset]!],
    ["banking_total_assets_yoy", block[assetYoyOffset]!],
    ["banking_total_liabilities", block[liabilityOffset]!],
    ["banking_total_liabilities_yoy", liabilityYoyOffsets[0]!.row],
  ]);
  const result = emptyResult("bank_assets_monthly");
  const today = Date.now();
  for (const series of NFRA_BANKING_SERIES.filter(
    (item) => item.dataset === "bank_assets_monthly",
  )) {
    const row = rowByKey.get(series.seriesKey);
    if (!row) throw new Error(`NFRA Banking：月度表无 ${series.seriesKey} 行映射`);
    for (const [month, col] of monthCols) {
      const obsDate = new Date(Date.UTC(year, month - 1, 1));
      if (obsDate.getTime() > today) {
        if (parseNumeric(row[col]) != null) result.skippedInvalid += 1;
        continue;
      }
      addPoint(result, series, obsDate, row[col]);
    }
  }
  assertRequiredPoints(result, "bank_assets_monthly", year);
  return result;
}

function parseQuarterly(rows: unknown[][], titleRowIdx: number): ParsedNfraBankingWorkbook {
  const year = workbookYear(rows, titleRowIdx);
  const headerMatches = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => ["一季度", "二季度", "三季度", "四季度"].every((q) => row.some((cell) => canonicalRowLabel(cell) === q)));
  if (headerMatches.length !== 1) {
    throw new Error(`NFRA Banking：季度表季度列锚点命中 ${headerMatches.length} 次（应为 1 次）`);
  }
  const { row: header, index: headerIdx } = headerMatches[0]!;
  const quarterCols = new Map<number, number>();
  for (const [quarter, label] of ["一季度", "二季度", "三季度", "四季度"].entries()) {
    const matches = header
      .map((cell, col) => ({ col, label: canonicalRowLabel(cell) }))
      .filter((item) => item.label === label);
    if (matches.length !== 1) {
      throw new Error(`NFRA Banking：季度表“${label}”列命中 ${matches.length} 次（应为 1 次）`);
    }
    quarterCols.set(quarter + 1, matches[0]!.col);
  }

  const configs = NFRA_BANKING_SERIES.filter(
    (series) => series.dataset === "commercial_bank_main_quarterly",
  );
  const wantedLabels = new Set(configs.map((series) => canonicalRowLabel(series.sourceRowLabel)));
  const rowByLabel = new Map<string, unknown[]>();
  for (const row of rows.slice(headerIdx + 1)) {
    const label = canonicalRowLabel(row[0]);
    if (!wantedLabels.has(label)) continue;
    if (rowByLabel.has(label)) {
      throw new Error(`NFRA Banking：季度表指标行重复：${label}`);
    }
    rowByLabel.set(label, row);
  }

  const result = emptyResult("commercial_bank_main_quarterly");
  const today = Date.now();
  for (const series of configs) {
    const label = canonicalRowLabel(series.sourceRowLabel);
    const row = rowByLabel.get(label);
    if (!row) {
      if ((series.availableFromYear ?? 0) > year) continue;
      throw new Error(`NFRA Banking：季度表缺指标行“${series.sourceRowLabel}”`);
    }
    for (const [quarter, col] of quarterCols) {
      const obsDate = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      if (obsDate.getTime() > today) {
        if (parseNumeric(row[col]) != null) result.skippedInvalid += 1;
        continue;
      }
      addPoint(result, series, obsDate, row[col]);
    }
  }
  assertRequiredPoints(result, "commercial_bank_main_quarterly", year);
  return result;
}

export function parseNfraBankingWorkbook(
  workbook: XLSX.WorkBook,
  dataset: NfraBankingDataset,
): ParsedNfraBankingWorkbook {
  assertCatalogIntegrity();
  if (!(dataset in DATASET_SHEET)) {
    throw new Error(`NFRA Banking：未知 dataset ${String(dataset)}`);
  }
  const rows = readRows(workbook, dataset);
  const titleRowIdx = findTitleRow(rows, dataset);
  return dataset === "bank_assets_monthly"
    ? parseMonthly(rows, titleRowIdx)
    : parseQuarterly(rows, titleRowIdx);
}

import * as XLSX from "xlsx";

export type ParsedMacroColumn = {
  colIndex: number;
  countryZh: string;
  metricZh: string;
  sectorZh: string;
  header: string;
  /** Excel「指标英文名称」行 */
  nameEn?: string;
  freqLabel?: string;
  unit?: string;
};

export type ParsedMacroPoint = {
  obsDate: Date;
  value: number;
};

export type ParsedMacroSeries = {
  column: ParsedMacroColumn;
  points: ParsedMacroPoint[];
};

export type MacroWorkbookLayoutOptions = {
  /** 首列标题，默认「指标名称」 */
  periodHeader?: string;
  /** 列头 regex，默认 国家:指标:子维度 */
  columnHeaderPattern?: RegExp;
};

export function ymToUtcDate(y: number, month: number): Date | null {
  if (!Number.isFinite(y) || y < 1900 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(y, month - 1, 1, 0, 0, 0));
}

/** 解析周期到该月 1 号 UTC（只取年+月） */
export function parsePeriodToDate(period: string): Date | null {
  const s = period.trim();
  if (!s) return null;

  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]));

  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]));

  m = /^(\d{4})[-/\s]*Q\s*([1-4])$/i.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]) * 3);

  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const ssf = (
      XLSX as unknown as {
        SSF?: { parse_date_code?: (n: number) => { y: number; m: number; d: number } | null };
      }
    ).SSF;
    const dc = ssf?.parse_date_code?.(serial);
    if (dc && dc.y) return ymToUtcDate(dc.y, dc.m);
  }

  return null;
}

export function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const METADATA_ROW_LABELS = new Set([
  "国家",
  "指标英文名称",
  "频率",
  "单位",
  "时间区间",
  "来源",
  "更新时间",
]);

function findMetadataRow(rows: string[][], label: string): number | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    if ((rows[r]?.[0] ?? "").trim() === label) return r;
  }
  return null;
}

function findDataStartRow(rows: string[][]): number {
  for (let r = 1; r < rows.length; r++) {
    const cell0 = String(rows[r]?.[0] ?? "").trim();
    if (!cell0 || METADATA_ROW_LABELS.has(cell0)) continue;
    if (parsePeriodToDate(cell0)) return r;
  }
  return 1;
}

function cellText(rows: string[][], rowIndex: number | null, colIndex: number): string {
  if (rowIndex == null || rowIndex < 0) return "";
  return String(rows[rowIndex]?.[colIndex] ?? "").trim();
}

export function parseMacroWorkbookSheet(
  ws: XLSX.WorkSheet,
  options?: MacroWorkbookLayoutOptions,
): ParsedMacroSeries[] {
  const periodHeader = options?.periodHeader ?? "指标名称";
  const columnPattern = options?.columnHeaderPattern ?? /^([^:]+):([^:]+):(.+)$/;

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 2) throw new Error("Excel 数据行不足");

  const header = rows[0] ?? [];
  if ((header[0] ?? "").trim() !== periodHeader) {
    throw new Error(`首列应为「${periodHeader}」，当前为：${header[0] ?? ""}`);
  }

  const nameEnRow = findMetadataRow(rows, "指标英文名称");
  const freqRow = findMetadataRow(rows, "频率");
  const unitRow = findMetadataRow(rows, "单位");
  const dataStartRow = findDataStartRow(rows);

  const seriesList: ParsedMacroSeries[] = [];

  for (let col = 1; col < header.length; col++) {
    const h = (header[col] ?? "").trim();
    if (!h) continue;
    const m = columnPattern.exec(h);
    if (!m) continue;

    const nameEn = cellText(rows, nameEnRow, col) || undefined;
    const freqLabel = cellText(rows, freqRow, col) || undefined;
    const unit = cellText(rows, unitRow, col) || undefined;

    const column: ParsedMacroColumn = {
      colIndex: col,
      countryZh: m[1]!.trim(),
      metricZh: m[2]!.trim(),
      sectorZh: m[3]!.trim(),
      header: h,
      nameEn,
      freqLabel,
      unit,
    };

    const points: ParsedMacroPoint[] = [];
    for (let r = dataStartRow; r < rows.length; r++) {
      const period = String(rows[r]?.[0] ?? "").trim();
      if (!period) continue;
      const obsDate = parsePeriodToDate(period);
      if (!obsDate) continue;
      const value = parseNumber(rows[r]?.[col]);
      if (value == null) continue;
      points.push({ obsDate, value });
    }
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
    seriesList.push({ column, points });
  }

  if (seriesList.length === 0) {
    throw new Error("未解析到任何指标列（列头须为 国家:指标:子维度）");
  }

  return seriesList;
}

export function readMacroWorkbookSeries(
  xlsxPath: string,
  sheetName?: string,
  layoutOptions?: MacroWorkbookLayoutOptions,
): { sheetName: string; series: ParsedMacroSeries[] } {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const resolvedSheet = sheetName && wb.SheetNames.includes(sheetName)
    ? sheetName
    : wb.SheetNames[0];
  if (!resolvedSheet) throw new Error("Excel 文件中没有工作表");
  const ws = wb.Sheets[resolvedSheet];
  if (!ws) throw new Error(`工作表不存在：${resolvedSheet}`);
  return {
    sheetName: resolvedSheet,
    series: parseMacroWorkbookSheet(ws, layoutOptions),
  };
}

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  CHINA_OVERVIEW_SERIES,
  normalizeChinaOverviewName,
} from "@/lib/data/chinaOverviewLayout";
import {
  JAPAN_OVERVIEW_SERIES,
  normalizeJapanOverviewName,
} from "@/lib/data/japanOverviewLayout";
import type { FetchIncrementalResult, ObservationPoint } from "../types";

export type OverviewTemplate = "china" | "japan";

type SeriesDef = {
  code: string;
  columnIndex: number;
  displayName: string;
};

const TEMPLATE_CONFIG: Record<
  OverviewTemplate,
  {
    envVar: string;
    defaultPath: string;
    prefix: string;
    series: readonly SeriesDef[];
    normalizeName: (name: string) => string;
  }
> = {
  china: {
    envVar: "CHINA_OVERVIEW_XLSX_PATH",
    defaultPath: "C:/Users/Administrator/Desktop/模板/China_Overview.xlsx",
    prefix: "chov_",
    series: CHINA_OVERVIEW_SERIES,
    normalizeName: normalizeChinaOverviewName,
  },
  japan: {
    envVar: "JAPAN_OVERVIEW_XLSX_PATH",
    defaultPath: "C:/Users/Administrator/Desktop/模板/Japan_Overview.xlsx",
    prefix: "jpov_",
    series: JAPAN_OVERVIEW_SERIES,
    normalizeName: normalizeJapanOverviewName,
  },
};

export function overviewTemplateForInstrument(code: string): OverviewTemplate | null {
  if (code.startsWith("chov_")) return "china";
  if (code.startsWith("jpov_")) return "japan";
  return null;
}

export function resolveOverviewXlsxPath(template: OverviewTemplate): string {
  const cfg = TEMPLATE_CONFIG[template];
  const envPath = process.env[cfg.envVar]?.trim();
  const candidates = [
    envPath,
    path.join(process.cwd(), template === "china" ? "China_Overview.xlsx" : "Japan_Overview.xlsx"),
    cfg.defaultPath,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `找不到 ${template} Overview xlsx，已尝试：${candidates.join("；")}。请设置 ${cfg.envVar}`,
  );
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const asDate = XLSX.SSF.parse_date_code(value);
    if (asDate?.y && asDate.m && asDate.d) {
      return new Date(Date.UTC(asDate.y, asDate.m - 1, asDate.d));
    }
  }
  const raw = String(value).trim();
  if (!raw) return null;

  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
  }

  const ym = /^(\d{4})[-/.](\d{1,2})$/.exec(raw);
  if (ym) return new Date(Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1));

  const yq = /^(\d{4})\s*[Qq季]\s*([1-4])$/.exec(raw) ?? /^(\d{4})\s*Q([1-4])$/i.exec(raw);
  if (yq) return new Date(Date.UTC(Number(yq[1]), (Number(yq[2]) - 1) * 3, 1));

  const y = /^(\d{4})$/.exec(raw);
  if (y) return new Date(Date.UTC(Number(y[1]), 0, 1));

  return null;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const text = String(raw).replace(/[,，\s]/g, "");
  if (!text) return null;
  const n = Number(text.replace(/%/g, ""));
  return Number.isFinite(n) ? n : null;
}

function locateHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const first = String(rows[i]?.[0] ?? "").trim();
    if (/^指标名称$/i.test(first)) return i;
  }
  throw new Error("未找到「指标名称」表头行");
}

function extractSeriesPoints(
  rows: unknown[][],
  def: SeriesDef,
  normalizeName: (name: string) => string,
): ObservationPoint[] {
  const headerRow = locateHeaderRow(rows);
  const header = (rows[headerRow] ?? []).map((v) => String(v ?? "").trim());
  const headerName = header[def.columnIndex]?.trim();
  if (!headerName) return [];
  if (normalizeName(headerName) !== normalizeName(def.displayName)) {
    // 列名轻微偏差仍尝试读取
  }

  const points: ObservationPoint[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const d = parseDate(rows[r]?.[0]);
    if (!d) continue;
    const value = parseNumber(rows[r]?.[def.columnIndex]);
    if (value == null) continue;
    points.push({ obsDate: d, value });
  }
  points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
  return points;
}

function loadAllSeriesPoints(
  template: OverviewTemplate,
): Map<string, ObservationPoint[]> {
  const cfg = TEMPLATE_CONFIG[template];
  const xlsxPath = resolveOverviewXlsxPath(template);
  const raw = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(raw, { type: "buffer", cellDates: false });
  if (!wb.SheetNames.length) throw new Error(`${xlsxPath} 无工作表`);

  const byCode = new Map<string, ObservationPoint[]>();
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];
    if (rows.length < 8) continue;

    for (const def of cfg.series) {
      if (byCode.has(def.code)) continue;
      const points = extractSeriesPoints(rows, def, cfg.normalizeName);
      if (points.length > 0) byCode.set(def.code, points);
    }
  }
  return byCode;
}

export function fetchOverviewIncremental(
  template: OverviewTemplate,
  instrumentCode: string,
  observationStart: string,
): FetchIncrementalResult {
  const cfg = TEMPLATE_CONFIG[template];
  if (!instrumentCode.startsWith(cfg.prefix)) {
    throw new Error(`${instrumentCode} 不属于 ${template} overview`);
  }

  const all = loadAllSeriesPoints(template);
  const full = all.get(instrumentCode);
  if (!full?.length) {
    throw new Error(`xlsx 中未找到序列 ${instrumentCode}`);
  }

  const startMs =
    observationStart && observationStart !== "1950-01-01"
      ? new Date(`${observationStart}T00:00:00Z`).getTime()
      : null;
  const points =
    startMs == null
      ? full
      : full.filter((p) => p.obsDate.getTime() >= startMs);

  const sourceLatestObsDate = full[full.length - 1]?.obsDate ?? null;
  return { points, sourceLatestObsDate, skippedInvalid: 0 };
}

export function listOverviewInstrumentCodes(template: OverviewTemplate): string[] {
  return TEMPLATE_CONFIG[template].series.map((s) => s.code);
}

import path from "node:path";
import { statSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  JAPAN_OVERVIEW_BY_CODE,
  JAPAN_OVERVIEW_SERIES,
  normalizeJapanOverviewName,
} from "../src/lib/data/japanOverviewLayout";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = "C:/Users/Administrator/Desktop/模板/Japan_Overview.xlsx";
const SOURCE_TAG = "japan-overview-xlsx";
const COUNTRY_CODE = "JP";
const COUNTRY_NAME_ZH = "日本";

type SeriesAttrs = {
  code: string;
  displayName: string;
  sheetName: string;
  panelIndex: number | null;
  columnIndex: number;
  catalogCategory: string;
  source: string;
  unit: string | null;
  freqLabel: string;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
};

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const asDate = XLSX.SSF.parse_date_code(value);
    if (asDate && asDate.y && asDate.m && asDate.d) {
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
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]);
    if (m >= 1 && m <= 12) return new Date(Date.UTC(y, m - 1, 1));
  }
  const yq = /^(\d{4})\s*[Qq季]\s*([1-4])$/.exec(raw) ?? /^(\d{4})\s*Q([1-4])$/i.exec(raw);
  if (yq) {
    const y = Number(yq[1]);
    const q = Number(yq[2]);
    return new Date(Date.UTC(y, (q - 1) * 3, 1));
  }
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
  if (!Number.isFinite(n)) return null;
  return n;
}

function inferFrequency(points: Date[]): string {
  if (points.length < 2) return "月";
  const sorted = [...points].sort((a, b) => a.getTime() - b.getTime());
  const days: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    days.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / 86_400_000);
  }
  days.sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)] ?? 30;
  if (median <= 2) return "日";
  if (median <= 10) return "周";
  if (median <= 45) return "月";
  if (median <= 135) return "季度";
  return "年";
}

function fmtDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeMetaCell(text: string): string {
  return text
    .replace(/^数据?来源[:：]?\s*/i, "")
    .replace(/^来源机构[:：]?\s*/i, "")
    .replace(/^来源[:：]?\s*/i, "")
    .replace(/^单位[:：]?\s*/i, "")
    .replace(/^频率[:：]?\s*/i, "")
    .trim();
}

function locateHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const first = String(rows[i]?.[0] ?? "").trim();
    if (/^指标名称$/i.test(first)) return i;
  }
  throw new Error("未找到「指标名称」表头行");
}

function locateMetaRow(rows: unknown[][], keys: RegExp[]): number | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const first = String(rows[i]?.[0] ?? "").trim();
    if (keys.some((re) => re.test(first))) return i;
  }
  return null;
}

function readWorkbookAttrs(sheetName: string, rows: unknown[][]): SeriesAttrs[] {
  if (rows.length < 8) return [];

  const headerRow = locateHeaderRow(rows);
  const header = (rows[headerRow] ?? []).map((v) => String(v ?? "").trim());
  const dateCol = 0;
  const freqRow = locateMetaRow(rows, [/频率/i]);
  const sourceRow = locateMetaRow(rows, [/来源/i, /source/i]);
  const unitRow = locateMetaRow(rows, [/单位/i, /\bunit\b/i]);

  const out: SeriesAttrs[] = [];

  for (const def of JAPAN_OVERVIEW_SERIES) {
    const c = def.columnIndex;
    const headerName = header[c]?.trim();
    if (!headerName) continue;
    if (normalizeJapanOverviewName(headerName) !== normalizeJapanOverviewName(def.displayName)) {
      console.warn(
        `[warn] column ${c} header mismatch: got "${headerName}", expected "${def.displayName}"`,
      );
    }

    const points: Date[] = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
      const d = parseDate(rows[r]?.[dateCol]);
      if (!d) continue;
      const value = parseNumber(rows[r]?.[c]);
      if (value == null) continue;
      points.push(d);
    }
    points.sort((a, b) => a.getTime() - b.getTime());

    const sourceRaw = sourceRow !== null ? String(rows[sourceRow]?.[c] ?? "").trim() : "";
    const unitRaw = unitRow !== null ? String(rows[unitRow]?.[c] ?? "").trim() : "";
    const freqRaw = freqRow !== null ? String(rows[freqRow]?.[c] ?? "").trim() : "";
    const source = normalizeMetaCell(sourceRaw) || "-";
    const unitNorm = normalizeMetaCell(unitRaw);
    const freqLabel = normalizeMetaCell(freqRaw) || inferFrequency(points);

    out.push({
      code: def.code,
      displayName: def.displayName,
      sheetName,
      panelIndex: def.panel,
      columnIndex: def.columnIndex,
      catalogCategory: def.catalogCategory,
      source,
      unit: unitNorm || null,
      freqLabel,
      rangeStartIso: points[0] ? fmtDateOnly(points[0]) : null,
      rangeEndIso: points[points.length - 1] ? fmtDateOnly(points[points.length - 1]) : null,
    });
  }

  return out;
}

async function main() {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX_PATH;
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  if (!wb.SheetNames.length) throw new Error("Excel 文件中没有工作表");

  const workbook = path.basename(xlsxPath);
  const workbookMtimeIso = statSync(xlsxPath).mtime.toISOString();
  const importedAtIso = new Date().toISOString();
  const attrsList: SeriesAttrs[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    attrsList.push(...readWorkbookAttrs(sheetName, rows));
  }

  const parsedRaw = attrsList.length;
  const mergedAttrs = attrsList.filter((row) => JAPAN_OVERVIEW_BY_CODE.has(row.code));

  const candidates = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      code: { startsWith: "jpov_" },
    },
    select: { id: true, code: true, metadata: true },
  });
  const candidatesByCode = new Map(candidates.map((x) => [x.code, x]));

  let updated = 0;
  for (const attrs of mergedAttrs) {
    const row = candidatesByCode.get(attrs.code);
    if (!row) {
      console.info(`[missing] instrument not found: ${attrs.code}`);
      continue;
    }

    const existingMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const nextMeta: Record<string, unknown> = {
      ...existingMeta,
      sourceTag: SOURCE_TAG,
      source: attrs.source,
      workbook,
      sheet: attrs.sheetName,
      panelIndex: attrs.panelIndex,
      columnIndex: attrs.columnIndex,
      countryCode: COUNTRY_CODE,
      countryNameZh: COUNTRY_NAME_ZH,
      displayName: attrs.displayName,
      catalogCategory: attrs.catalogCategory,
      freqLabel: attrs.freqLabel,
      unit: attrs.unit,
      timeRange: {
        start: attrs.rangeStartIso,
        end: attrs.rangeEndIso,
      },
      dataLastObsDateIso: attrs.rangeEndIso,
      template: "Japan_Overview",
      workbookMtimeIso,
      importedAtIso,
    };

    await prisma.instrument.update({
      where: { id: row.id },
      data: { metadata: nextMeta as object },
    });
    updated += 1;
  }

  console.info(
    `[done] parsed=${parsedRaw} merged=${mergedAttrs.length} updated=${updated} missing=${mergedAttrs.length - updated}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

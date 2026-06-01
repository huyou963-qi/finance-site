import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  JAPAN_OVERVIEW_CATEGORY_CODE_BY_NAME,
  JAPAN_OVERVIEW_CATEGORY_SORT_BY_NAME,
  JAPAN_OVERVIEW_SERIES,
  normalizeJapanOverviewName,
} from "../src/lib/data/japanOverviewLayout";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = "C:/Users/Administrator/Desktop/模板/Japan_Overview.xlsx";
const SOURCE_TAG = "japan-overview-xlsx";
const COUNTRY_CODE = "JP";
const COUNTRY_NAME_ZH = "日本";

type SeriesSeed = {
  code: string;
  displayName: string;
  categoryName: string;
  sheetName: string;
  panelIndex: number | null;
  columnIndex: number;
  source: string;
  unit: string | null;
  freqLabel: string;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
  points: Array<{ obsDate: Date; value: number }>;
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

function inferFrequency(points: Array<{ obsDate: Date; value: number }>): string {
  if (points.length < 2) return "月";
  const days: number[] = [];
  for (let i = 1; i < points.length; i++) {
    days.push((points[i]!.obsDate.getTime() - points[i - 1]!.obsDate.getTime()) / 86_400_000);
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

async function upsertCategory(
  code: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
) {
  await prisma.macroCategory.upsert({
    where: { code },
    create: { code, name, parentId, sortOrder, metadata: { source: SOURCE_TAG } as object },
    update: { name, parentId, sortOrder },
    select: { id: true },
  });
  const row = await prisma.macroCategory.findUnique({ where: { code }, select: { id: true } });
  if (!row) throw new Error(`upsert category failed: ${code}`);
  return row.id;
}

function parseWorkbookSeries(sheetName: string, rows: unknown[][]): SeriesSeed[] {
  if (rows.length < 8) return [];

  const headerRow = locateHeaderRow(rows);
  const header = (rows[headerRow] ?? []).map((v) => String(v ?? "").trim());
  const dateCol = 0;
  const freqRow = locateMetaRow(rows, [/频率/i]);
  const sourceRow = locateMetaRow(rows, [/来源/i, /source/i]);
  const unitRow = locateMetaRow(rows, [/单位/i, /\bunit\b/i]);

  const out: SeriesSeed[] = [];

  for (const def of JAPAN_OVERVIEW_SERIES) {
    const c = def.columnIndex;
    const headerName = header[c]?.trim();
    if (!headerName) {
      console.warn(`[skip] column ${c} empty header, expected ${def.displayName}`);
      continue;
    }
    if (normalizeJapanOverviewName(headerName) !== normalizeJapanOverviewName(def.displayName)) {
      console.warn(
        `[warn] column ${c} header mismatch: got "${headerName}", expected "${def.displayName}"`,
      );
    }

    const points: Array<{ obsDate: Date; value: number }> = [];
    for (let r = headerRow + 1; r < rows.length; r++) {
      const d = parseDate(rows[r]?.[dateCol]);
      if (!d) continue;
      const value = parseNumber(rows[r]?.[c]);
      if (value == null) continue;
      points.push({ obsDate: d, value });
    }
    if (points.length === 0) {
      console.warn(`[skip] ${def.code}: no data points`);
      continue;
    }
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());

    const sourceRaw = sourceRow !== null ? String(rows[sourceRow]?.[c] ?? "").trim() : "";
    const unitRaw = unitRow !== null ? String(rows[unitRow]?.[c] ?? "").trim() : "";
    const freqRaw = freqRow !== null ? String(rows[freqRow]?.[c] ?? "").trim() : "";
    const source = normalizeMetaCell(sourceRaw) || "-";
    const unitNorm = normalizeMetaCell(unitRaw);
    const freqLabel = normalizeMetaCell(freqRaw) || inferFrequency(points);

    out.push({
      code: def.code,
      displayName: def.displayName,
      categoryName: def.catalogCategory,
      sheetName,
      panelIndex: def.panel,
      columnIndex: def.columnIndex,
      source,
      unit: unitNorm || null,
      freqLabel,
      rangeStartIso: fmtDateOnly(points[0]!.obsDate),
      rangeEndIso: fmtDateOnly(points[points.length - 1]!.obsDate),
      points,
    });
  }

  return out;
}

async function main() {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX_PATH;
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  if (!wb.SheetNames.length) throw new Error("Excel 文件中没有工作表");

  const existing = await prisma.instrument.findMany({
    where: {
      kind: InstrumentKind.MACRO_SERIES,
      code: { startsWith: "jpov_" },
    },
    select: { id: true },
  });
  if (existing.length > 0) {
    const ids = existing.map((x) => x.id);
    await prisma.macroObservation.deleteMany({ where: { instrumentId: { in: ids } } });
    await prisma.instrument.deleteMany({ where: { id: { in: ids } } });
  }

  const rootCategoryId = await upsertCategory("macro_country", "国家宏观", null, 0);
  const jpCategoryId = await upsertCategory("macro_country_jp", "日本", rootCategoryId, 15);

  const themeCategoryIds = new Map<string, string>();
  for (const name of new Set(JAPAN_OVERVIEW_SERIES.map((row) => row.catalogCategory))) {
    const slug = JAPAN_OVERVIEW_CATEGORY_CODE_BY_NAME[name];
    if (!slug) throw new Error(`missing category code mapping: ${name}`);
    const id = await upsertCategory(
      `macro_country_jp_${slug}`,
      name,
      jpCategoryId,
      JAPAN_OVERVIEW_CATEGORY_SORT_BY_NAME[name] ?? 500,
    );
    themeCategoryIds.set(name, id);
  }

  let importedSeries = 0;
  let importedPoints = 0;
  const seriesList: SeriesSeed[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    seriesList.push(...parseWorkbookSeries(sheetName, rows));
  }

  if (seriesList.length !== JAPAN_OVERVIEW_SERIES.length) {
    console.warn(
      `[warn] expected ${JAPAN_OVERVIEW_SERIES.length} series, parsed ${seriesList.length}`,
    );
  }

  for (const series of seriesList) {
    const themeCategoryId = themeCategoryIds.get(series.categoryName);
    if (!themeCategoryId) throw new Error(`missing theme category ${series.categoryName}`);

    const instrument = await prisma.instrument.upsert({
      where: { code: series.code },
      create: {
        code: series.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `Japan Overview:${series.displayName}`,
        shortName: series.displayName,
        description: "Japan Overview 导入序列",
        freqLabel: series.freqLabel,
        unit: series.unit,
        categoryId: themeCategoryId,
        metadata: {
          sourceTag: SOURCE_TAG,
          source: series.source,
          workbook: path.basename(xlsxPath),
          sheet: series.sheetName,
          panelIndex: series.panelIndex,
          columnIndex: series.columnIndex,
          countryCode: COUNTRY_CODE,
          countryNameZh: COUNTRY_NAME_ZH,
          displayName: series.displayName,
          freqLabel: series.freqLabel,
          unit: series.unit,
          timeRange: {
            start: series.rangeStartIso,
            end: series.rangeEndIso,
          },
          dataLastObsDateIso: series.rangeEndIso,
          catalogCategory: series.categoryName,
          template: "Japan_Overview",
        } as object,
      },
      update: {
        name: `Japan Overview:${series.displayName}`,
        shortName: series.displayName,
        description: "Japan Overview 导入序列",
        freqLabel: series.freqLabel,
        unit: series.unit,
        categoryId: themeCategoryId,
        metadata: {
          sourceTag: SOURCE_TAG,
          source: series.source,
          workbook: path.basename(xlsxPath),
          sheet: series.sheetName,
          panelIndex: series.panelIndex,
          columnIndex: series.columnIndex,
          countryCode: COUNTRY_CODE,
          countryNameZh: COUNTRY_NAME_ZH,
          displayName: series.displayName,
          freqLabel: series.freqLabel,
          unit: series.unit,
          timeRange: {
            start: series.rangeStartIso,
            end: series.rangeEndIso,
          },
          dataLastObsDateIso: series.rangeEndIso,
          catalogCategory: series.categoryName,
          template: "Japan_Overview",
        } as object,
      },
      select: { id: true },
    });

    await prisma.macroObservation.deleteMany({ where: { instrumentId: instrument.id } });
    await prisma.macroObservation.createMany({
      data: series.points.map((p) => ({
        instrumentId: instrument.id,
        obsDate: p.obsDate,
        value: p.value,
      })),
    });

    importedSeries += 1;
    importedPoints += series.points.length;
    console.info(`Imported ${series.code}: ${series.points.length} points`);
  }

  console.info(
    `[done] workbook=${path.basename(xlsxPath)} source=${SOURCE_TAG} series=${importedSeries} points=${importedPoints}`,
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

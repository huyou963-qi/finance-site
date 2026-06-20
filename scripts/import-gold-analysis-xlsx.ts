import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  GOLD_ANALYSIS_CATEGORY_CODE_BY_NAME,
  GOLD_ANALYSIS_CATEGORY_SORT_BY_NAME,
  GOLD_ANALYSIS_COUNTRY_BY_CODE,
  GOLD_ANALYSIS_SERIES,
  goldCategoryKey,
  normalizeGoldName,
} from "../src/lib/data/goldAnalysisLayout";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = "C:/Users/Administrator/Desktop/模板/黄金期货头寸.xlsx";
const SOURCE_TAG = "gold-analysis-xlsx";

type SeriesSeed = {
  code: string;
  displayName: string;
  categoryName: string;
  countryCode: string;
  countryNameZh: string;
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
  const countryRow = headerRow > 0 ? headerRow - 1 : null;
  const freqRow = locateMetaRow(rows, [/频率/i]);
  const sourceRow = locateMetaRow(rows, [/来源/i, /source/i]);
  const unitRow = locateMetaRow(rows, [/单位/i, /\bunit\b/i]);

  const headerNorm = header.map((h) => normalizeGoldName(h));
  const out: SeriesSeed[] = [];

  for (const def of GOLD_ANALYSIS_SERIES) {
    let c = def.columnIndex;
    const expected = normalizeGoldName(def.displayName);
    if (headerNorm[c] !== expected) {
      const found = headerNorm.findIndex((h) => h === expected);
      if (found >= 0) {
        c = found;
      } else {
        console.warn(
          `[warn] column ${def.columnIndex} header mismatch: got "${header[def.columnIndex] ?? ""}", expected "${def.displayName}"`,
        );
      }
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

    const countryRaw =
      countryRow !== null ? String(rows[countryRow]?.[c] ?? "").trim() : def.countryNameZh;
    const countryNameZh = countryRaw || def.countryNameZh;
    const countryCode =
      countryNameZh === "英国"
        ? "GB"
        : countryNameZh === "瑞士"
          ? "CH"
          : def.countryCode;

    out.push({
      code: def.code,
      displayName: def.displayName,
      categoryName: def.catalogCategory,
      countryCode,
      countryNameZh: GOLD_ANALYSIS_COUNTRY_BY_CODE[countryCode] ?? countryNameZh,
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

  const rootCategoryId = await upsertCategory("macro_country", "国家宏观", null, 0);

  const countryCategoryIds = new Map<string, string>();
  const themeCategoryIds = new Map<string, string>();

  for (const def of GOLD_ANALYSIS_SERIES) {
    const cc = def.countryCode.toLowerCase();
    const countryName = GOLD_ANALYSIS_COUNTRY_BY_CODE[def.countryCode] ?? def.countryNameZh;
    const countryCodeKey = `macro_country_${cc}`;
    if (!countryCategoryIds.has(def.countryCode)) {
      const id = await upsertCategory(countryCodeKey, countryName, rootCategoryId, 10);
      countryCategoryIds.set(def.countryCode, id);
    }

    const catKey = goldCategoryKey(def.countryCode, def.catalogCategory);
    if (themeCategoryIds.has(catKey)) continue;
    const slug = GOLD_ANALYSIS_CATEGORY_CODE_BY_NAME[def.catalogCategory];
    if (!slug) throw new Error(`missing category code mapping: ${def.catalogCategory}`);
    const parentId = countryCategoryIds.get(def.countryCode)!;
    const id = await upsertCategory(
      `${countryCodeKey}_${slug}`,
      def.catalogCategory,
      parentId,
      GOLD_ANALYSIS_CATEGORY_SORT_BY_NAME[def.catalogCategory] ?? 500,
    );
    themeCategoryIds.set(catKey, id);
  }

  const seriesList: SeriesSeed[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    seriesList.push(...parseWorkbookSeries(sheetName, rows));
  }

  if (seriesList.length !== GOLD_ANALYSIS_SERIES.length) {
    console.warn(
      `[warn] expected ${GOLD_ANALYSIS_SERIES.length} series, parsed ${seriesList.length}`,
    );
  }

  let imported = 0;
  let skipped = 0;
  let importedPoints = 0;

  for (const series of seriesList) {
    const catKey = goldCategoryKey(series.countryCode, series.categoryName);
    const themeCategoryId = themeCategoryIds.get(catKey);
    if (!themeCategoryId) throw new Error(`missing theme category ${catKey}`);

    const existing = await prisma.instrument.findUnique({
      where: { code: series.code },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      console.info(`[skip] ${series.code}: 已存在，跳过`);
      continue;
    }

    const instrument = await prisma.instrument.create({
      data: {
        code: series.code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `黄金分析:${series.displayName}`,
        shortName: series.displayName,
        description: "黄金期货头寸 导入序列",
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
          countryCode: series.countryCode,
          countryNameZh: series.countryNameZh,
          displayName: series.displayName,
          freqLabel: series.freqLabel,
          unit: series.unit,
          timeRange: {
            start: series.rangeStartIso,
            end: series.rangeEndIso,
          },
          dataLastObsDateIso: series.rangeEndIso,
          catalogCategory: series.categoryName,
          template: "Gold_Analysis",
        } as object,
      },
      select: { id: true },
    });

    await prisma.macroObservation.createMany({
      data: series.points.map((p) => ({
        instrumentId: instrument.id,
        obsDate: p.obsDate,
        value: p.value,
      })),
    });

    imported += 1;
    importedPoints += series.points.length;
    console.info(`Imported ${series.code}: ${series.points.length} points`);
  }

  console.info(
    `[done] workbook=${path.basename(xlsxPath)} source=${SOURCE_TAG} imported=${imported} skipped=${skipped} points=${importedPoints}`,
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

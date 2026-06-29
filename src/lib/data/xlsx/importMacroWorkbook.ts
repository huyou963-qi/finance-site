import crypto from "node:crypto";
import path from "node:path";
import { InstrumentKind, type PrismaClient } from "@prisma/client";
import type { ParsedMacroSeries } from "./macroWorkbookLayout";

export type MacroImportScopeConfig = {
  scope: string;
  freqLabel: string;
  unit: string;
  sourceTag: string;
  /** ISO 国家中文 → code */
  countryCodeByZh: Record<string, string>;
  metricCodeByZh?: Record<string, string>;
  sectorCodeByZh?: Record<string, string>;
  catalogCategoryByMetricZh?: Record<string, string>;
  categoryRootName?: string;
  categoryThemeName?: string;
};

function fallbackCode(prefix: string, text: string): string {
  const md5 = crypto.createHash("md5").update(text).digest("hex").slice(0, 10);
  return `${prefix}_${md5}`;
}

export type MacroImportPlanRow = {
  code: string;
  skipped: boolean;
  skipReason?: string;
  header: string;
  nameEn?: string;
  freqLabel: string;
  unit: string;
  catalogCategory: string;
  treePath: string;
  pointCount: number;
  dateFrom?: string;
  dateTo?: string;
};

/** dry-run：预览 instrument code、目录树与观测范围（不写库） */
export function planMacroWorkbookImport(
  series: ParsedMacroSeries[],
  config: MacroImportScopeConfig,
): MacroImportPlanRow[] {
  const rootName = config.categoryRootName ?? "国家宏观";
  const themeName = config.categoryThemeName ?? config.scope;
  const rows: MacroImportPlanRow[] = [];

  for (const { column, points } of series) {
    const countryCode = config.countryCodeByZh[column.countryZh];
    if (!countryCode) {
      rows.push({
        code: "—",
        skipped: true,
        skipReason: `未知国家中文：${column.countryZh}`,
        header: column.header,
        nameEn: column.nameEn,
        freqLabel: column.freqLabel?.trim() || config.freqLabel,
        unit: column.unit?.trim() || config.unit,
        catalogCategory: "—",
        treePath: "—",
        pointCount: points.length,
      });
      continue;
    }

    const metricCode =
      config.metricCodeByZh?.[column.metricZh] ?? fallbackCode("metric", column.metricZh);
    const sectorCode =
      config.sectorCodeByZh?.[column.sectorZh] ?? fallbackCode("sector", column.sectorZh);
    const code = `${config.scope}_${countryCode.toLowerCase()}_${metricCode}_${sectorCode}`;
    const catalogCategory =
      config.catalogCategoryByMetricZh?.[column.metricZh] ?? themeName;
    const treePath = `${rootName} → ${column.countryZh} → ${themeName} → ${column.metricZh} → ${column.sectorZh}`;

    rows.push({
      code,
      skipped: false,
      header: column.header,
      nameEn: column.nameEn,
      freqLabel: column.freqLabel?.trim() || config.freqLabel,
      unit: column.unit?.trim() || config.unit,
      catalogCategory,
      treePath,
      pointCount: points.length,
      dateFrom: points[0]?.obsDate.toISOString().slice(0, 10),
      dateTo: points[points.length - 1]?.obsDate.toISOString().slice(0, 10),
    });
  }

  return rows;
}

async function upsertCategory(
  prisma: PrismaClient,
  code: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
  sourceTag: string,
) {
  await prisma.macroCategory.upsert({
    where: { code },
    create: { code, name, parentId, sortOrder, metadata: { source: sourceTag } as object },
    update: { name, parentId, sortOrder },
    select: { id: true },
  });
  const row = await prisma.macroCategory.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!row) throw new Error(`upsert category failed: ${code}`);
  return row.id;
}

export type MacroImportResult = {
  importedSeries: number;
  importedPoints: number;
  codes: string[];
};

export async function importMacroWorkbookSeries(
  prisma: PrismaClient,
  params: {
    xlsxPath: string;
    sheetName: string;
    series: ParsedMacroSeries[];
    config: MacroImportScopeConfig;
  },
): Promise<MacroImportResult> {
  const { xlsxPath, sheetName, series, config } = params;
  const rootName = config.categoryRootName ?? "国家宏观";
  const themeName = config.categoryThemeName ?? config.scope;

  const rootCategoryId = await upsertCategory(
    prisma,
    "macro_country",
    rootName,
    null,
    0,
    config.sourceTag,
  );

  let importedSeries = 0;
  let importedPoints = 0;
  const codes: string[] = [];

  for (const { column, points } of series) {
    const countryCode = config.countryCodeByZh[column.countryZh];
    if (!countryCode) continue;

    const metricCode =
      config.metricCodeByZh?.[column.metricZh] ?? fallbackCode("metric", column.metricZh);
    const sectorCode =
      config.sectorCodeByZh?.[column.sectorZh] ?? fallbackCode("sector", column.sectorZh);
    const code = `${config.scope}_${countryCode.toLowerCase()}_${metricCode}_${sectorCode}`;
    codes.push(code);

    const countryCategoryId = await upsertCategory(
      prisma,
      `macro_country_${countryCode.toLowerCase()}`,
      column.countryZh,
      rootCategoryId,
      10,
      config.sourceTag,
    );
    const themeCategoryId = await upsertCategory(
      prisma,
      `macro_country_${countryCode.toLowerCase()}_${config.scope}`,
      themeName,
      countryCategoryId,
      20,
      config.sourceTag,
    );
    const metricCategoryId = await upsertCategory(
      prisma,
      `macro_country_${countryCode.toLowerCase()}_${config.scope}_${metricCode}`,
      column.metricZh,
      themeCategoryId,
      30,
      config.sourceTag,
    );
    const sectorCategoryId = await upsertCategory(
      prisma,
      `macro_country_${countryCode.toLowerCase()}_${config.scope}_${metricCode}_${sectorCode}`,
      column.sectorZh,
      metricCategoryId,
      40,
      config.sourceTag,
    );

    const instrument = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true, metadata: true },
    });

    const prevMd =
      instrument?.metadata && typeof instrument.metadata === "object"
        ? (instrument.metadata as Record<string, unknown>)
        : {};
    const networkWired =
      prevMd.bootstrapOnly === false &&
      prevMd.fetchAcquisition &&
      typeof prevMd.fetchAcquisition === "object" &&
      (prevMd.fetchAcquisition as Record<string, unknown>).status === "known";

    const importMetadata = {
      ...prevMd,
      bootstrap: "excel",
      bootstrapOnly: networkWired ? false : true,
      sourceTag: config.sourceTag,
      workbook: path.basename(xlsxPath),
      sheet: sheetName,
      importedAt: new Date().toISOString(),
      workbookLayout: "country:metric:sector_v1",
      countryCode,
      countryNameZh: column.countryZh,
      metricZh: column.metricZh,
      metricCode,
      sectorZh: column.sectorZh,
      sectorCode,
      displayName: column.header,
      nameEn: column.nameEn ?? null,
      catalogCategory:
        config.catalogCategoryByMetricZh?.[column.metricZh] ?? themeName,
    } as object;

    const freqLabel = column.freqLabel?.trim() || config.freqLabel;
    const unit = column.unit?.trim() || config.unit;

    const saved = await prisma.instrument.upsert({
      where: { code },
      create: {
        code,
        kind: InstrumentKind.MACRO_SERIES,
        name: column.header,
        nameEn: column.nameEn ?? null,
        shortName: `${column.metricZh}:${column.sectorZh}`,
        description: `${themeName}（${column.countryZh}）`,
        freqLabel,
        unit,
        categoryId: sectorCategoryId,
        metadata: importMetadata,
      },
      update: {
        name: column.header,
        nameEn: column.nameEn ?? null,
        shortName: `${column.metricZh}:${column.sectorZh}`,
        freqLabel,
        unit,
        categoryId: sectorCategoryId,
        metadata: importMetadata,
      },
      select: { id: true },
    });

    await prisma.macroObservation.deleteMany({
      where: { instrumentId: saved.id },
    });
    if (points.length > 0) {
      await prisma.macroObservation.createMany({
        data: points.map((p) => ({
          instrumentId: saved.id,
          obsDate: p.obsDate,
          value: p.value,
        })),
      });
    }

    importedSeries += 1;
    importedPoints += points.length;
  }

  return { importedSeries, importedPoints, codes };
}

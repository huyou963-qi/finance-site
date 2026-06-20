import crypto from "node:crypto";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { InstrumentKind, PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = "C:/Users/Administrator/Desktop/模板/国家偿债能力.xlsx";
const SOURCE_TAG = "debt-capacity-xlsx";
const SHEET_NAME = "美国_杠杆率_居民部门";

const COUNTRY_CODE_BY_ZH: Record<string, string> = {
  中国: "CN",
  美国: "US",
  日本: "JP",
  德国: "DE",
};

const METRIC_CODE_BY_ZH: Record<string, string> = {
  杠杆率: "leverage",
  "杠杆率(按名义价值计)": "leverage_nominal",
  偿债率: "debt_service",
};

const CATALOG_CATEGORY_BY_METRIC_ZH: Record<string, string> = {
  杠杆率: "偿债能力·杠杆率",
  "杠杆率(按名义价值计)": "偿债能力·杠杆率",
  偿债率: "偿债能力·偿债率",
};

const SECTOR_CODE_BY_ZH: Record<string, string> = {
  居民部门: "household",
  非金融企业部门: "non_financial_corporate",
  私营非金融部门: "private_non_financial",
  政府部门: "government",
};

function fallbackCode(prefix: string, text: string): string {
  const md5 = crypto.createHash("md5").update(text).digest("hex").slice(0, 10);
  return `${prefix}_${md5}`;
}

function ymToUtcDate(y: number, month: number): Date | null {
  if (!Number.isFinite(y) || y < 1900 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(y, month - 1, 1, 0, 0, 0));
}

/**
 * 解析周期到「该月 1 号 UTC」。只提取年+月、时区无关，永不因日级换算跨月：
 * 支持 2024-03 / 2024-03-31 / 2024/3 / 2024/3/31 / 2024.03 / 2024年3月[31日] / 2024Q1(=季末月) / Excel 序列号。
 * 这样季度数据（3/6/9/12）不会被错误地挪到 4/7/10/1。
 */
function parsePeriodToDate(period: string): Date | null {
  const s = period.trim();
  if (!s) return null;

  // 年-月[-日] / 年/月[/日] / 年.月[.日]：忽略「日」，只取年月
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]));

  // 2024年3月 / 2024年3月31日
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]));

  // 2024Q1 / 2024-Q1 / 2024 Q1 → 季末月 3/6/9/12
  m = /^(\d{4})[-/\s]*Q\s*([1-4])$/i.exec(s);
  if (m) return ymToUtcDate(Number(m[1]), Number(m[2]) * 3);

  // 纯数字 → Excel 日期序列号，用 SSF 做时区无关解析
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

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
  const row = await prisma.macroCategory.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!row) throw new Error(`upsert category failed: ${code}`);
  return row.id;
}

async function main() {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX_PATH;
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel 文件中没有工作表");
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
  if (rows.length < 3) throw new Error("Excel 数据行不足");

  const header = rows[0] ?? [];
  if ((header[0] ?? "").trim() !== "指标名称") {
    throw new Error(`首列应为“指标名称”，当前为：${header[0] ?? ""}`);
  }

  const rootCategoryId = await upsertCategory("macro_country", "国家宏观", null, 0);
  let importedSeries = 0;
  let importedPoints = 0;
  const monthHistogram: Record<string, number> = {};

  for (let col = 1; col < header.length; col++) {
    const h = (header[col] ?? "").trim();
    if (!h) continue;
    const m = /^([^:]+):([^:]+):(.+)$/.exec(h);
    if (!m) continue;
    const countryZh = m[1]!.trim();
    const metricZh = m[2]!.trim();
    const sectorZh = m[3]!.trim();
    const countryCode = COUNTRY_CODE_BY_ZH[countryZh];
    if (!countryCode) continue;

    const metricCode = METRIC_CODE_BY_ZH[metricZh] ?? fallbackCode("metric", metricZh);
    const sectorCode = SECTOR_CODE_BY_ZH[sectorZh] ?? fallbackCode("sector", sectorZh);
    const code = `debtcap_${countryCode.toLowerCase()}_${metricCode}_${sectorCode}`;

    const countryCategoryId = await upsertCategory(
      `macro_country_${countryCode.toLowerCase()}`,
      countryZh,
      rootCategoryId,
      10,
    );
    const debtCategoryId = await upsertCategory(
      `macro_country_${countryCode.toLowerCase()}_debt_capacity`,
      "偿债能力",
      countryCategoryId,
      20,
    );
    const metricCategoryId = await upsertCategory(
      `macro_country_${countryCode.toLowerCase()}_debt_capacity_${metricCode}`,
      metricZh,
      debtCategoryId,
      30,
    );

    const instrument = await prisma.instrument.upsert({
      where: { code },
      create: {
        code,
        kind: InstrumentKind.MACRO_SERIES,
        name: `${countryZh}:${metricZh}:${sectorZh}`,
        shortName: `${metricZh}:${sectorZh}`,
        description: `国家偿债能力（${countryZh}）`,
        freqLabel: "季度",
        unit: "%",
        categoryId: metricCategoryId,
        metadata: {
          sourceTag: SOURCE_TAG,
          workbook: path.basename(xlsxPath),
          sheet: sheetName,
          countryCode,
          countryNameZh: countryZh,
          metricZh,
          metricCode,
          sectorZh,
          sectorCode,
          displayName: `${countryZh}:${metricZh}:${sectorZh}`,
          catalogCategory: CATALOG_CATEGORY_BY_METRIC_ZH[metricZh] ?? "偿债能力",
        } as object,
      },
      update: {
        name: `${countryZh}:${metricZh}:${sectorZh}`,
        shortName: `${metricZh}:${sectorZh}`,
        description: `国家偿债能力（${countryZh}）`,
        freqLabel: "季度",
        unit: "%",
        categoryId: metricCategoryId,
        metadata: {
          sourceTag: SOURCE_TAG,
          workbook: path.basename(xlsxPath),
          sheet: sheetName,
          countryCode,
          countryNameZh: countryZh,
          metricZh,
          metricCode,
          sectorZh,
          sectorCode,
          displayName: `${countryZh}:${metricZh}:${sectorZh}`,
          catalogCategory: CATALOG_CATEGORY_BY_METRIC_ZH[metricZh] ?? "偿债能力",
        } as object,
      },
      select: { id: true },
    });

    const points: Array<{ obsDate: Date; value: number }> = [];
    for (let r = 1; r < rows.length; r++) {
      const period = String(rows[r]?.[0] ?? "").trim();
      if (!period) continue;
      const obsDate = parsePeriodToDate(period);
      if (!obsDate) continue;
      const value = parseNumber(rows[r]?.[col]);
      if (value == null) continue;
      points.push({ obsDate, value });
      const mm = String(obsDate.getUTCMonth() + 1).padStart(2, "0");
      monthHistogram[mm] = (monthHistogram[mm] ?? 0) + 1;
    }
    points.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());

    await prisma.macroObservation.deleteMany({
      where: { instrumentId: instrument.id },
    });
    if (points.length > 0) {
      await prisma.macroObservation.createMany({
        data: points.map((p) => ({
          instrumentId: instrument.id,
          obsDate: p.obsDate,
          value: p.value,
        })),
      });
    }

    importedSeries += 1;
    importedPoints += points.length;
    console.info(`Imported ${code}: ${points.length} points`);
  }

  console.info(
    `[done] workbook=${path.basename(xlsxPath)} sheet=${sheetName} series=${importedSeries} points=${importedPoints}`,
  );
  console.info(`[months] 导入数据的月份分布（应仅含 03/06/09/12）：`, monthHistogram);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


import path from "node:path";
import { statSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const DEFAULT_XLSX_PATH = "C:/Users/Administrator/Desktop/国家偿债能力.xlsx";
const SOURCE_TAG = "debt-capacity-xlsx";

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

const SECTOR_CODE_BY_ZH: Record<string, string> = {
  居民部门: "household",
  非金融企业部门: "non_financial_corporate",
  私营非金融部门: "private_non_financial",
  政府部门: "government",
};

type SeriesAttrs = {
  code: string;
  sheetName: string;
  countryCode: string;
  countryNameZh: string;
  metricZh: string;
  sectorZh: string;
  source: string;
  unit: string | null;
  freqLabel: string | null;
  rangeStartIso: string | null;
  rangeEndIso: string | null;
};

function parsePeriodToDate(period: string): Date | null {
  const s = period.trim();
  const ym = /^(\d{4})-(\d{2})$/.exec(s);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]);
    if (m >= 1 && m <= 12) return new Date(Date.UTC(y, m - 1, 1));
  }
  const yq = /^(\d{4})\s*[Qq季]\s*([1-4])$/.exec(s);
  if (yq) {
    const y = Number(yq[1]);
    const q = Number(yq[2]);
    return new Date(Date.UTC(y, (q - 1) * 3, 1));
  }
  const y = /^(\d{4})$/.exec(s);
  if (y) return new Date(Date.UTC(Number(y[1]), 0, 1));
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[,%\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function inferFrequency(points: Date[]): string {
  if (points.length < 2) return "季度";
  const sorted = [...points].sort((a, b) => a.getTime() - b.getTime());
  const days: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    days.push((sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / 86_400_000);
  }
  days.sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)] ?? 90;
  if (median <= 2) return "日";
  if (median <= 10) return "周";
  if (median <= 45) return "月";
  if (median <= 135) return "季度";
  return "年";
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function detectUnitFromWorkbookName(fileName: string): string | null {
  if (fileName.includes("偿债能力")) return "%";
  return null;
}

function splitHeaderParts(headerText: string): [string, string, string] | null {
  const normalized = headerText.replace(/[：]/g, ":").trim();
  const m = /^([^:]+):([^:]+):(.+)$/.exec(normalized);
  if (!m) return null;
  return [m[1]!.trim(), m[2]!.trim(), m[3]!.trim()];
}

function locateHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] ?? [];
    const first = String(row[0] ?? "").trim();
    const joined = row.map((x) => String(x ?? "").trim()).join("|");
    if (first === "指标名称" || first === "日期" || /指标名称/.test(joined)) return i;
  }
  return 0;
}

function locateSourceRow(rows: string[][]): number | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] ?? [];
    const first = String(row[0] ?? "").trim();
    const joined = row.map((x) => String(x ?? "").trim()).join("|");
    if (/来源/.test(first) || /数据来源/.test(first) || /来源机构/.test(first)) return i;
    if (/来源/.test(joined) && i <= 10) return i;
  }
  // 兜底：用户明确说明“第六行来源”
  if (rows.length >= 6) return 5;
  return null;
}

function normalizeSourceText(input: string): string {
  const s = input
    .replace(/^数据?来源[:：]?\s*/i, "")
    .replace(/^来源机构[:：]?\s*/i, "")
    .replace(/^来源[:：]?\s*/i, "")
    .trim();
  return s || "-";
}

function readSeriesAttrsFromSheet(
  rows: string[][],
  workbookBaseName: string,
  sheetName: string,
): SeriesAttrs[] {
  if (rows.length < 2) return [];
  const headerRow = locateHeaderRow(rows);
  const dataStartRow = headerRow + 1;
  const sourceRow = locateSourceRow(rows);
  const header = rows[headerRow] ?? [];
  const out: SeriesAttrs[] = [];

  for (let col = 1; col < header.length; col++) {
    const h = String(header[col] ?? "").trim();
    if (!h) continue;
    const parts = splitHeaderParts(h);
    if (!parts) continue;
    const [countryZh, metricZh, sectorZh] = parts;
    const countryCode = COUNTRY_CODE_BY_ZH[countryZh];
    if (!countryCode) continue;
    const metricCode = METRIC_CODE_BY_ZH[metricZh];
    const sectorCode = SECTOR_CODE_BY_ZH[sectorZh];
    if (!metricCode || !sectorCode) continue;

    const code = `debtcap_${countryCode.toLowerCase()}_${metricCode}_${sectorCode}`;
    const datePoints: Date[] = [];

    for (let r = dataStartRow; r < rows.length; r++) {
      const period = String(rows[r]?.[0] ?? "").trim();
      if (!period) continue;
      const obsDate = parsePeriodToDate(period);
      if (!obsDate) continue;
      const value = parseNumber(rows[r]?.[col]);
      if (value == null) continue;
      datePoints.push(obsDate);
    }

    datePoints.sort((a, b) => a.getTime() - b.getTime());
    const first = datePoints[0] ?? null;
    const last = datePoints[datePoints.length - 1] ?? null;
    const freqLabel = inferFrequency(datePoints);
    const unit = detectUnitFromWorkbookName(workbookBaseName);
    const sourceText =
      sourceRow !== null ? String(rows[sourceRow]?.[col] ?? "").trim() : "";
    const source = normalizeSourceText(sourceText);

    out.push({
      code,
      sheetName,
      countryCode,
      countryNameZh: countryZh,
      metricZh,
      sectorZh,
      source,
      unit,
      freqLabel,
      rangeStartIso: first ? isoDateOnly(first) : null,
      rangeEndIso: last ? isoDateOnly(last) : null,
    });
  }
  return out;
}

async function main() {
  const xlsxPath = process.argv[2] ?? DEFAULT_XLSX_PATH;
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const workbookBaseName = path.basename(xlsxPath);
  const workbookMtimeIso = statSync(xlsxPath).mtime.toISOString();
  const importedAtIso = new Date().toISOString();
  const attrsList: SeriesAttrs[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
    const part = readSeriesAttrsFromSheet(rows, workbookBaseName, sheetName);
    attrsList.push(...part);
  }
  const dedupByCode = new Map<string, SeriesAttrs>();
  for (const row of attrsList) dedupByCode.set(row.code, row);
  const mergedAttrs = [...dedupByCode.values()];
  const attrsByCode = new Map(mergedAttrs.map((x) => [x.code, x]));

  const candidates = await prisma.instrument.findMany({
    where: {
      code: { in: [...attrsByCode.keys()] },
    },
    select: { id: true, code: true, metadata: true },
  });

  let updated = 0;
  for (const row of candidates) {
    const attrs = attrsByCode.get(row.code);
    if (!attrs) continue;
    const existingMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const nextMeta: Record<string, unknown> = {
      ...existingMeta,
      sourceTag: SOURCE_TAG,
      source: attrs.source,
      workbook: workbookBaseName,
      sheet: attrs.sheetName,
      workbookUpdatedAtIso: workbookMtimeIso,
      attrsBackfilledAtIso: importedAtIso,
      countryCode: attrs.countryCode,
      countryNameZh: attrs.countryNameZh,
      metricZh: attrs.metricZh,
      sectorZh: attrs.sectorZh,
      freqLabel: attrs.freqLabel,
      unit: attrs.unit,
      timeRange: {
        start: attrs.rangeStartIso,
        end: attrs.rangeEndIso,
      },
      dataLastObsDateIso: attrs.rangeEndIso,
    };

    await prisma.instrument.update({
      where: { id: row.id },
      data: {
        freqLabel: attrs.freqLabel,
        unit: attrs.unit,
        metadata: nextMeta,
      },
    });
    updated += 1;
  }

  const missing = mergedAttrs.length - updated;
  console.info(
    `[done] workbook=${workbookBaseName} parsed=${mergedAttrs.length} updated=${updated} missing=${missing}`,
  );
  if (missing > 0) {
    const found = new Set(candidates.map((x) => x.code));
    for (const x of mergedAttrs) {
      if (!found.has(x.code)) {
        console.info(`[missing] instrument not found: ${x.code}`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import path from "node:path";
import fs from "node:fs";
import { read, utils, SSF } from "xlsx";
import type { AssetCode } from "./assetReturnCatalog";
import { ASSET_RETURN_DEFS } from "./assetReturnCatalog";

export type AssetBar = {
  date: string;
  low: number;
  high: number;
  close: number;
};

function normalizeHeader(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]/g, "");
}

function parseExcelDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    const parsed = SSF.parse_date_code(raw);
    if (parsed) {
      const y = String(parsed.y).padStart(4, "0");
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  if (typeof raw === "string") {
    const v = raw.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const fromSlash = v.replace(/\//g, "-");
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromSlash)) return fromSlash;
  }
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function detectColumns(headers: unknown[]) {
  const normalized = headers.map((h) => normalizeHeader(h));
  const findBy = (...names: string[]) => {
    for (const n of names) {
      const idx = normalized.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const date = findBy("date", "日期", "tradingdate", "time");
  const high = findBy("high", "最高", "最高价");
  const low = findBy("low", "最低", "最低价");
  const close = findBy("close", "收盘", "收盘价", "adjclose", "adjustedclose");

  return {
    date: date >= 0 ? date : 0,
    high: high >= 0 ? high : 2,
    low: low >= 0 ? low : 3,
    close: close >= 0 ? close : 4,
  };
}

export function resolveAssetXlsxPath(fileName: string): string {
  const envDir = process.env.ASSET_DATA_DIR?.trim();
  const cwd = process.cwd();
  const candidates = [
    envDir ? path.join(envDir, fileName) : null,
    path.join(cwd, fileName),
    path.join(cwd, "data", fileName),
    path.join(cwd, "assets", fileName),
    path.resolve(cwd, "..", fileName),
    path.resolve(cwd, "..", "finance-site", fileName),
  ].filter((v): v is string => Boolean(v));

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Cannot access file ${path.join(cwd, fileName)}. Tried: ${candidates.join(" | ")}. ` +
      `Place the Excel files in project root, or set ASSET_DATA_DIR.`,
  );
}

export function parseAssetBarsFromXlsxFile(
  asset: AssetCode,
  filePath?: string,
): AssetBar[] {
  const fileName = ASSET_RETURN_DEFS[asset].xlsxFile;
  const resolved = filePath ?? resolveAssetXlsxPath(fileName);
  const raw = fs.readFileSync(resolved);
  const wb = read(raw, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error(`${asset} 数据为空：未找到工作表`);
  }

  const rows = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    blankrows: false,
  });
  if (rows.length < 2) {
    throw new Error(`${asset} 数据为空：行数不足`);
  }

  const { date, high, low, close } = detectColumns(rows[0] ?? []);
  const bars: AssetBar[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const d = parseExcelDate(row[date]);
    const h = parseNumber(row[high]);
    const l = parseNumber(row[low]);
    const c = parseNumber(row[close]);
    if (!d || h == null || l == null || c == null) continue;
    bars.push({ date: d, high: h, low: l, close: c });
  }

  bars.sort((a, b) => a.date.localeCompare(b.date));
  return bars;
}

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

export type EtfHoldingSnapshotRow = {
  etf: string;
  asOfDate: string;
  holdingKey: string;
  symbol: string | null;
  cusip: string | null;
  name: string;
  weight: number;
  shares: number | null;
};

export type ParsedEtfHoldingSnapshot = {
  etf: string;
  asOfDate: string;
  rows: EtfHoldingSnapshotRow[];
  totalWeight: number;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = text(value).replace(/[,%]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSsgaDate(value: string): string | null {
  const match = value.match(/As of\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})/i);
  if (!match) return null;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const month = months[match[2]!.toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1]!.padStart(2, "0")}` : null;
}

export function validateEtfHoldingSnapshot(
  rows: readonly EtfHoldingSnapshotRow[],
): { totalWeight: number; securityWeight: number } {
  if (!rows.length) throw new Error("持仓文件没有数据行");
  const keys = new Set<string>();
  let totalWeight = 0;
  let securityWeight = 0;
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.asOfDate)) throw new Error(`非法 asOfDate: ${row.asOfDate}`);
    if (!row.holdingKey || keys.has(row.holdingKey)) throw new Error(`重复/空 holdingKey: ${row.holdingKey}`);
    if (!Number.isFinite(row.weight) || row.weight < 0 || row.weight > 1.05) {
      throw new Error(`${row.etf} ${row.holdingKey} 权重非法: ${row.weight}`);
    }
    keys.add(row.holdingKey);
    totalWeight += row.weight;
    if (row.symbol) securityWeight += row.weight;
  }
  if (totalWeight < 0.9 || totalWeight > 1.05) {
    throw new Error(`持仓权重合计 ${(totalWeight * 100).toFixed(2)}%，不在 90%–105% 验收区间`);
  }
  return { totalWeight, securityWeight };
}

/** 解析 State Street “Download All Holdings: Daily” 官方工作簿。原始 Weight 是百分数。 */
export function parseSsgaHoldingsWorkbook(
  input: Buffer | Uint8Array,
  expectedEtf?: string,
): ParsedEtfHoldingSnapshot {
  const workbook = XLSX.read(input, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error("持仓工作簿没有 worksheet");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const tickerRow = matrix.find((row) => text(row[0]).toLowerCase() === "ticker symbol:");
  const holdingsRow = matrix.find((row) => text(row[0]).toLowerCase() === "holdings:");
  const headerIndex = matrix.findIndex((row) => text(row[0]) === "Name" && text(row[1]) === "Ticker");
  const etf = text(tickerRow?.[1]).toUpperCase();
  const asOfDate = parseSsgaDate(text(holdingsRow?.[1]));
  if (!etf || !asOfDate || headerIndex < 0) throw new Error("无法识别 State Street 持仓表头/日期/ETF");
  if (expectedEtf && etf !== expectedEtf.trim().toUpperCase()) {
    throw new Error(`持仓文件 ETF=${etf}，与请求 ${expectedEtf} 不一致`);
  }
  const rows: EtfHoldingSnapshotRow[] = [];
  for (const raw of matrix.slice(headerIndex + 1)) {
    const name = text(raw[0]);
    const symbolRaw = text(raw[1]).toUpperCase();
    const cusip = text(raw[2]).toUpperCase() || null;
    const weightPct = number(raw[4]);
    if (!name || weightPct == null || weightPct < 0) continue;
    const symbol = symbolRaw && symbolRaw !== "-" ? symbolRaw.replace(/[./]/g, "-") : null;
    const holdingKey = cusip || symbol || `NAME:${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 48)}`;
    rows.push({
      etf,
      asOfDate,
      holdingKey,
      symbol,
      cusip,
      name,
      weight: weightPct / 100,
      shares: number(raw[6]),
    });
  }
  const { totalWeight } = validateEtfHoldingSnapshot(rows);
  return { etf, asOfDate, rows, totalWeight };
}

export function ssgaDailyHoldingsUrl(etf: string): string {
  return `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${etf.trim().toLowerCase()}.xlsx`;
}

export async function fetchSsgaDailyHoldings(etf: string): Promise<ParsedEtfHoldingSnapshot> {
  const url = ssgaDailyHoldingsUrl(etf);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "hblook.com sector-history admin@hblook.com" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`State Street ${etf} holdings HTTP ${response.status}`);
  return parseSsgaHoldingsWorkbook(Buffer.from(await response.arrayBuffer()), etf);
}

export async function replaceEtfHoldingSnapshot(
  snapshot: ParsedEtfHoldingSnapshot,
  source = "State Street daily holdings",
  sourceUrl = ssgaDailyHoldingsUrl(snapshot.etf),
): Promise<number> {
  validateEtfHoldingSnapshot(snapshot.rows);
  const asOfDate = new Date(`${snapshot.asOfDate}T00:00:00.000Z`);
  await prisma.$transaction([
    prisma.sectorEtfHolding.deleteMany({ where: { etf: snapshot.etf, asOfDate } }),
    prisma.sectorEtfHolding.createMany({
      data: snapshot.rows.map((row) => ({
        etf: row.etf,
        asOfDate,
        holdingKey: row.holdingKey,
        symbol: row.symbol,
        cusip: row.cusip,
        name: row.name,
        weight: row.weight,
        shares: row.shares,
        source,
        sourceUrl,
        metadata: { originalWeightUnit: "percent", parser: "ssga-daily-v1" },
      })),
    }),
  ]);
  return snapshot.rows.length;
}

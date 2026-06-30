import { prisma } from "@/lib/prisma";
import {
  ALL_ASSET_CODES,
  ASSET_RETURN_DEFS,
  ASSET_RETURN_TIMEFRAME,
  type AssetCode,
} from "./assetReturnCatalog";
import type { AssetBar } from "./assetReturnXlsx";

export type { AssetCode } from "./assetReturnCatalog";
export type { AssetBar };

export type AssetWindowReturn = {
  asset: AssetCode;
  startDate: string;
  endDate: string;
  closeToCloseReturn: number;
  lowToHighReturn: number;
  startClose: number;
  endClose: number;
  startLow: number;
  endHigh: number;
  tradingDays: number;
};

type AssetHistory = {
  asset: AssetCode;
  bars: AssetBar[];
};

let cachedHistories: AssetHistory[] | null = null;
let cachePromise: Promise<AssetHistory[]> | null = null;

function dateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

async function loadOneAssetFromDb(asset: AssetCode): Promise<AssetHistory> {
  const def = ASSET_RETURN_DEFS[asset];
  const instrument = await prisma.instrument.findUnique({
    where: { code: def.instrumentCode },
    select: { id: true },
  });
  if (!instrument) {
    throw new Error(
      `数据库未导入 ${asset} 行情（instrument ${def.instrumentCode}）。` +
        `请在项目根目录放置 ${def.xlsxFile} 后运行：npm run db:import-asset-return-xlsx`,
    );
  }

  const rows = await prisma.bar.findMany({
    where: {
      instrumentId: instrument.id,
      timeframe: ASSET_RETURN_TIMEFRAME,
    },
    orderBy: { openedAt: "asc" },
    select: {
      openedAt: true,
      high: true,
      low: true,
      close: true,
    },
  });

  if (rows.length === 0) {
    throw new Error(
      `${asset} 在数据库中无日 K 数据。请运行：npm run db:import-asset-return-xlsx`,
    );
  }

  const bars = rows.map((row) => ({
    date: row.openedAt.toISOString().slice(0, 10),
    high: row.high,
    low: row.low,
    close: row.close,
  }));

  return { asset, bars };
}

async function loadHistories(): Promise<AssetHistory[]> {
  if (cachedHistories) return cachedHistories;
  if (!cachePromise) {
    cachePromise = Promise.all(ALL_ASSET_CODES.map((asset) => loadOneAssetFromDb(asset)));
  }
  cachedHistories = await cachePromise;
  return cachedHistories;
}

function pickWindow(
  bars: AssetBar[],
  startDate: string,
  endDate: string,
): { start: AssetBar; end: AssetBar; tradingDays: number } | null {
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < bars.length; i++) {
    if (bars[i]!.date >= startDate) {
      startIdx = i;
      break;
    }
  }
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i]!.date <= endDate) {
      endIdx = i;
      break;
    }
  }

  if (startIdx < 0 || endIdx < 0 || startIdx > endIdx) return null;
  return {
    start: bars[startIdx]!,
    end: bars[endIdx]!,
    tradingDays: endIdx - startIdx + 1,
  };
}

export async function listAssetMeta() {
  const histories = await loadHistories();
  return histories.map((h) => ({
    asset: h.asset,
    firstDate: h.bars[0]?.date ?? "",
    lastDate: h.bars[h.bars.length - 1]?.date ?? "",
    rows: h.bars.length,
  }));
}

export async function calcAssetReturns(
  startDate: string,
  endDate: string,
  assets: AssetCode[],
): Promise<AssetWindowReturn[]> {
  const histories = await loadHistories();
  const pickedAssets = new Set<AssetCode>(assets);

  return histories
    .filter((h) => pickedAssets.has(h.asset))
    .map((h) => {
      const window = pickWindow(h.bars, startDate, endDate);
      if (!window) return null;
      const closeToCloseReturn =
        window.start.close === 0
          ? 0
          : (window.end.close - window.start.close) / window.start.close;
      const lowToHighReturn =
        window.start.low === 0
          ? 0
          : (window.end.high - window.start.low) / window.start.low;
      return {
        asset: h.asset,
        startDate: window.start.date,
        endDate: window.end.date,
        closeToCloseReturn,
        lowToHighReturn,
        startClose: window.start.close,
        endClose: window.end.close,
        startLow: window.start.low,
        endHigh: window.end.high,
        tradingDays: window.tradingDays,
      };
    })
    .filter((x): x is AssetWindowReturn => x !== null);
}

/** 供导入脚本写入 Bar 表 */
export function assetBarToDbRow(bar: AssetBar) {
  return {
    openedAt: dateToUtc(bar.date),
    open: bar.close,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: 0,
  };
}

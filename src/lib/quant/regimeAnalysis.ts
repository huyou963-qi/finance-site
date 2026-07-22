/**
 * 宏观 regime 联动分析（Phase 4 WS4，数据层）：分 regime 的 GICS 行业收益。
 *
 * - 行业收益 = 各 GICS sector 成分股次期等权前向收益（复用 factorResearchData 的网格价格/前向收益）。
 * - 按信号日 regime 桶分组，时间平均 → sector × regime 表；附全市场等权基准对照。
 * - GICS 现值近似（EquitySecurity 快照，非 PIT；早年退市股无归属，见 Phase 1 遗留项）。
 */

import { prisma } from "@/lib/prisma";
import {
  buildForwardReturns,
  listResearchGrid,
  loadGridCloses,
  REGIME_ORDER,
} from "@/lib/quant/factorResearchData";
import { loadRegimeMap, type RegimeQuadrant } from "@/lib/quant/macroRegime";

export type RegimeCell = { meanReturn: number | null; periods: number };

export type SectorRegimePerformance = {
  start: string;
  end: string;
  sectors: string[];
  regimes: RegimeQuadrant[];
  /** sector → regime → 等权次期月收益的时间平均 */
  cells: Record<string, Record<RegimeQuadrant, RegimeCell>>;
  /** 各 regime 的全市场等权基准 */
  marketByRegime: Record<RegimeQuadrant, RegimeCell>;
  regimeAvailable: boolean;
};

function emptyRegimeRow(): Record<RegimeQuadrant, RegimeCell> {
  return {
    recovery: { meanReturn: null, periods: 0 },
    overheat: { meanReturn: null, periods: 0 },
    stagflation: { meanReturn: null, periods: 0 },
    contraction: { meanReturn: null, periods: 0 },
  };
}

/** 现值 GICS：symbol → sector（仅有归属者） */
async function loadSectorMap(): Promise<Map<string, string>> {
  const rows = await prisma.equitySecurity.findMany({
    where: { gicsSector: { not: null } },
    select: { symbol: true, gicsSector: true },
  });
  return new Map(rows.map((r) => [r.symbol, r.gicsSector!]));
}

/**
 * 分 regime 的 GICS 行业次期收益。
 * 每期：按 sector 分组等权平均次期前向收益 + 全市场等权；按该期 regime 累加，末尾取均值。
 */
export async function sectorPerformanceByRegime(opts: {
  start?: string | null;
  end?: string | null;
} = {}): Promise<SectorRegimePerformance> {
  const gridDates = await listResearchGrid(opts);
  if (gridDates.length < 2) {
    throw new Error(`研究区间内网格期数不足（${gridDates.length}）`);
  }
  const sectorMap = await loadSectorMap();
  const symbols = [...sectorMap.keys()];
  const closes = await loadGridCloses(symbols, gridDates);
  const fwdReturns = buildForwardReturns(closes, gridDates);
  const regimeByDate = await loadRegimeMap(gridDates);

  const sectors = [...new Set(sectorMap.values())].sort();
  // 累加器：sector → regime → { sum, periods }
  const acc = new Map<string, Record<RegimeQuadrant, { sum: number; periods: number }>>();
  for (const s of sectors) {
    acc.set(s, {
      recovery: { sum: 0, periods: 0 },
      overheat: { sum: 0, periods: 0 },
      stagflation: { sum: 0, periods: 0 },
      contraction: { sum: 0, periods: 0 },
    });
  }
  const marketAcc: Record<RegimeQuadrant, { sum: number; periods: number }> = {
    recovery: { sum: 0, periods: 0 },
    overheat: { sum: 0, periods: 0 },
    stagflation: { sum: 0, periods: 0 },
    contraction: { sum: 0, periods: 0 },
  };

  // 末期无前向收益（i=len-1 恒 null），逐期到倒数第二期
  for (let i = 0; i < gridDates.length - 1; i++) {
    const regime = regimeByDate.get(gridDates[i]!);
    if (!regime) continue;
    // 该期各 sector 等权收益
    const sectorSum = new Map<string, { sum: number; n: number }>();
    let mktSum = 0;
    let mktN = 0;
    for (const [symbol, sector] of sectorMap) {
      const r = fwdReturns.get(symbol)?.[i];
      if (r == null || !Number.isFinite(r)) continue;
      let cell = sectorSum.get(sector);
      if (!cell) sectorSum.set(sector, (cell = { sum: 0, n: 0 }));
      cell.sum += r;
      cell.n += 1;
      mktSum += r;
      mktN += 1;
    }
    for (const [sector, { sum, n }] of sectorSum) {
      if (n === 0) continue;
      const bucket = acc.get(sector)![regime];
      bucket.sum += sum / n;
      bucket.periods += 1;
    }
    if (mktN > 0) {
      marketAcc[regime].sum += mktSum / mktN;
      marketAcc[regime].periods += 1;
    }
  }

  const cells: Record<string, Record<RegimeQuadrant, RegimeCell>> = {};
  for (const sector of sectors) {
    const row = emptyRegimeRow();
    for (const regime of REGIME_ORDER) {
      const b = acc.get(sector)![regime];
      row[regime] = {
        meanReturn: b.periods > 0 ? b.sum / b.periods : null,
        periods: b.periods,
      };
    }
    cells[sector] = row;
  }
  const marketByRegime = emptyRegimeRow();
  for (const regime of REGIME_ORDER) {
    const b = marketAcc[regime];
    marketByRegime[regime] = {
      meanReturn: b.periods > 0 ? b.sum / b.periods : null,
      periods: b.periods,
    };
  }

  return {
    start: gridDates[0]!,
    end: gridDates[gridDates.length - 1]!,
    sectors,
    regimes: REGIME_ORDER,
    cells,
    marketByRegime,
    regimeAvailable: regimeByDate.size > 0,
  };
}

/**
 * 因子研究数据装配层（Phase 4 WS1/WS2）：前向收益面 + IC/分层 + 相关矩阵 + 中性化对照。
 * 纯函数引擎在 factorResearch.ts；本模块负责触库，供 API 路由调用。
 *
 * - 月频网格 = listFactorDates 按自然月取最后一期去重（与回测调仓日历同源）。
 * - 前向收益：fwdRet(symbol, i) = adjClose(网格 i+1 期) / adjClose(网格 i 期) − 1，
 *   价格用 backtestData.loadPricesColumnar 列式批载（含分红复权，比值即总收益）；
 *   某期无新价（退市/停牌，距网格日 >7 天）→ null，该股当期从 IC/分层剔除。
 * - IC 用因子 zscore（截面标准化暴露）；中性化对照用 sectorZscore（行业内标准化，
 *   Phase 1 已落库，天然行业中性化）。二者 IC 之差 = 行业暴露对因子有效性的贡献。
 */

import { prisma } from "@/lib/prisma";
import { buildRebalanceCalendar, dayToIso, isoToDay } from "@/lib/quant/backtest";
import { listFactorDates } from "@/lib/quant/screenerData";
import { FACTOR_MAP } from "@/lib/quant/factorRegistry";
import {
  cumulativeIC,
  pearson,
  spearmanIC,
  summarizeIC,
  summarizeLayering,
  type ICSummary,
  type LayeringSummary,
} from "@/lib/quant/factorResearch";
import { loadRegimeMap, type RegimeQuadrant } from "@/lib/quant/macroRegime";

/** 四象限固定顺序（分 regime 表的列序） */
export const REGIME_ORDER: RegimeQuadrant[] = [
  "recovery",
  "overheat",
  "stagflation",
  "contraction",
];

const DEFAULT_QUANTILES = 5;
const PRICE_SYMBOL_CHUNK = 120;
/** 网格日回看窗口（自然日）：因子截面日多为日历月末（可能落周末/假日），取 ≤ 网格日最近交易日 */
const GRID_LOOKBACK_DAYS = 6;

export type FactorMetric = "zscore" | "sectorZscore";

// ────────────────────────────────────────────────────────── 网格 + 面板

/** 研究月频网格（升序 ISO），按 [start,end] 裁剪。 */
export async function listResearchGrid(opts: {
  start?: string | null;
  end?: string | null;
} = {}): Promise<string[]> {
  const factorDates = await listFactorDates();
  return buildRebalanceCalendar(factorDates, opts);
}

/** date → symbol → {zscore, sectorZscore}（仅取所选 factorKey） */
type FactorPanel = Map<string, Map<string, Map<string, { zscore: number | null; sectorZscore: number | null }>>>;

async function loadFactorPanel(
  factorKeys: readonly string[],
  dates: readonly string[],
): Promise<FactorPanel> {
  const panel: FactorPanel = new Map();
  for (const d of dates) panel.set(d, new Map(factorKeys.map((k) => [k, new Map()])));
  const dateObjs = dates.map((d) => new Date(`${d}T00:00:00.000Z`));
  const rows = await prisma.factorSnapshot.findMany({
    where: { factorKey: { in: [...factorKeys] }, date: { in: dateObjs } },
    select: { symbol: true, date: true, factorKey: true, zscore: true, sectorZscore: true },
  });
  for (const r of rows) {
    const iso = r.date.toISOString().slice(0, 10);
    const byFactor = panel.get(iso);
    if (!byFactor) continue;
    byFactor.get(r.factorKey)?.set(r.symbol, {
      zscore: r.zscore,
      sectorZscore: r.sectorZscore,
    });
  }
  return panel;
}

/** 全网格涉及的 symbol 集合（用于价格批载） */
async function symbolsInPanel(panel: FactorPanel): Promise<string[]> {
  const set = new Set<string>();
  for (const byFactor of panel.values()) {
    for (const bySymbol of byFactor.values()) {
      for (const s of bySymbol.keys()) set.add(s);
    }
  }
  return [...set];
}

// ────────────────────────────────────────────────────────── 前向收益

/**
 * 网格日的 adjClose（月频研究只需月末价，勿批载全日频历史）：因子截面日多为日历月末，
 * 可能落周末/假日，故只批载各网格日 [网格日−6天, 网格日] 窗口内的交易日 bar，
 * 每个网格日取窗口内最近的一根（≤ 网格日）作复权收盘。停牌/退市 → 该网格日 null。
 * 返回 symbol → 各网格日 adjClose（缺失/非正 → null，与网格等长）。
 */
export async function loadGridCloses(
  symbols: readonly string[],
  gridDates: readonly string[],
): Promise<Map<string, (number | null)[]>> {
  // 候选交易日 = 各网格日回看窗口的日历日并集；ISO 串 + ::date[] 强转（避免 timestamptz 失配）
  const candidateSet = new Set<string>();
  for (const g of gridDates) {
    const gd = isoToDay(g);
    for (let k = 0; k <= GRID_LOOKBACK_DAYS; k++) candidateSet.add(dayToIso(gd - k));
  }
  const candidates = [...candidateSet];
  const gridDays = gridDates.map(isoToDay);

  const out = new Map<string, (number | null)[]>();
  const unique = [...new Set(symbols)];
  for (const s of unique) out.set(s, gridDates.map(() => null));

  for (let i = 0; i < unique.length; i += PRICE_SYMBOL_CHUNK) {
    const chunk = unique.slice(i, i + PRICE_SYMBOL_CHUNK);
    const rows = await prisma.$queryRaw<{ symbol: string; date: Date; adj_close: number }[]>`
      SELECT symbol, date, adj_close
      FROM mds.equity_daily_bar
      WHERE symbol = ANY(${chunk})
        AND date = ANY(${candidates}::date[])
        AND adj_close > 0 AND close > 0
    `;
    // symbol → barDay → px（窗口内极少行，直接 Map 存）
    const bySym = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const px = Number(r.adj_close);
      if (!(px > 0)) continue;
      const day = Math.floor(r.date.getTime() / 86_400_000);
      let m = bySym.get(r.symbol);
      if (!m) bySym.set(r.symbol, (m = new Map()));
      m.set(day, px);
    }
    for (const [symbol, dayPx] of bySym) {
      const series = out.get(symbol)!;
      for (let gi = 0; gi < gridDays.length; gi++) {
        // 网格日回看：取窗口内最近的 ≤ 网格日一根
        for (let k = 0; k <= GRID_LOOKBACK_DAYS; k++) {
          const px = dayPx.get(gridDays[gi]! - k);
          if (px != null) {
            series[gi] = px;
            break;
          }
        }
      }
    }
  }
  return out;
}

/** symbol → 逐网格前向收益（网格 i → i+1）；末期与无价期为 null */
export function buildForwardReturns(
  closes: ReadonlyMap<string, (number | null)[]>,
  gridDates: readonly string[],
): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const [symbol, px] of closes) {
    const fwd: (number | null)[] = [];
    for (let i = 0; i < gridDates.length; i++) {
      const cur = px[i];
      const nxt = i + 1 < gridDates.length ? px[i + 1] : null;
      fwd.push(cur != null && nxt != null && cur > 0 ? nxt / cur - 1 : null);
    }
    out.set(symbol, fwd);
  }
  return out;
}

// ────────────────────────────────────────────────────────── 单因子研究

export type FactorICPeriod = {
  /** 信号日（因子截面日） */
  date: string;
  /** 前向收益终点（下一网格日）；末期 null */
  nextDate: string | null;
  /** 该期截面 IC（成对完整样本 <2 → null） */
  ic: number | null;
  /** 参与该期 IC 的成对完整样本数 */
  n: number;
};

export type FactorResearchResult = {
  factorKey: string;
  nameZh: string;
  nameEn: string;
  category: string;
  higherIsBetter: boolean;
  metric: FactorMetric;
  quantiles: number;
  periods: FactorICPeriod[];
  cumulativeIC: number[];
  icSummary: ICSummary;
  layering: LayeringSummary;
  /** 行业中性化对照：sectorZscore 口径的 IC 汇总（量化行业暴露贡献） */
  neutralizedIcSummary: ICSummary;
  /** 分 regime 的 IC 汇总（联动分析，WS4）：按信号日 regime 桶分组的 zscore IC */
  icByRegime: Record<RegimeQuadrant, ICSummary>;
};

/** 对齐同一 symbol 序列，产出 (因子值, 前向收益) 两数组 */
function alignSeries(
  bySymbol: Map<string, { zscore: number | null; sectorZscore: number | null }>,
  fwdReturns: ReadonlyMap<string, (number | null)[]>,
  periodIdx: number,
  metric: FactorMetric,
): { factorValues: (number | null)[]; fwdReturns: (number | null)[]; n: number } {
  const factorValues: (number | null)[] = [];
  const fwd: (number | null)[] = [];
  let n = 0;
  for (const [symbol, cell] of bySymbol) {
    const fv = metric === "zscore" ? cell.zscore : cell.sectorZscore;
    const fr = fwdReturns.get(symbol)?.[periodIdx] ?? null;
    factorValues.push(fv);
    fwd.push(fr);
    if (fv != null && Number.isFinite(fv) && fr != null && Number.isFinite(fr)) n++;
  }
  return { factorValues, fwdReturns: fwd, n };
}

// ────────────────────────────────────────────────────────── 相关矩阵

export type FactorCorrelation = {
  factorKeys: string[];
  /** 时间平均的截面 Pearson 相关（zscore 口径）；对角线 = 1 */
  matrix: (number | null)[][];
};

/** 逐期截面 Pearson 相关（zscore）再时间平均 */
function computeCorrelation(
  panel: FactorPanel,
  gridDates: readonly string[],
  factorKeys: readonly string[],
): FactorCorrelation {
  const keys = [...factorKeys];
  const sum = keys.map(() => keys.map(() => 0));
  const cnt = keys.map(() => keys.map(() => 0));
  for (const d of gridDates) {
    const byFactor = panel.get(d);
    if (!byFactor) continue;
    // 该期各因子的 symbol→zscore
    for (let a = 0; a < keys.length; a++) {
      for (let b = a; b < keys.length; b++) {
        const ma = byFactor.get(keys[a]!);
        const mb = byFactor.get(keys[b]!);
        if (!ma || !mb) continue;
        const xa: (number | null)[] = [];
        const xb: (number | null)[] = [];
        // 以 a 的 symbol 为准对齐 b
        for (const [symbol, cell] of ma) {
          xa.push(cell.zscore);
          xb.push(mb.get(symbol)?.zscore ?? null);
        }
        const r = pearson(xa, xb);
        if (r != null) {
          sum[a]![b]! += r;
          cnt[a]![b]! += 1;
        }
      }
    }
  }
  const matrix = keys.map((_, a) =>
    keys.map((__, b) => {
      const [i, j] = a <= b ? [a, b] : [b, a];
      if (i === j) return 1;
      return cnt[i]![j]! > 0 ? sum[i]![j]! / cnt[i]![j]! : null;
    }),
  );
  return { factorKeys: keys, matrix };
}

// ────────────────────────────────────────────────────────── 编排

export type FactorResearchOptions = {
  start?: string | null;
  end?: string | null;
  quantiles?: number;
};

export type FactorResearchReport = {
  start: string;
  end: string;
  gridDates: string[];
  /** 网格涉及的 symbol 总数（价格宇宙） */
  symbolCount: number;
  factors: FactorResearchResult[];
  correlation: FactorCorrelation;
  /** 各网格日 regime（联动分析；未落库则缺项，需先跑 quant:build-regime） */
  regimeByDate: Record<string, RegimeQuadrant>;
  /** regime 是否已落库覆盖网格（false → 提示先构建 regime） */
  regimeAvailable: boolean;
};

/** 按 regime 桶分组 period IC 并各自汇总 */
function icByRegimeOf(
  periods: readonly FactorICPeriod[],
  regimeByDate: ReadonlyMap<string, RegimeQuadrant>,
): Record<RegimeQuadrant, ICSummary> {
  const buckets: Record<RegimeQuadrant, (number | null)[]> = {
    recovery: [],
    overheat: [],
    stagflation: [],
    contraction: [],
  };
  for (const p of periods) {
    const r = regimeByDate.get(p.date);
    if (r) buckets[r].push(p.ic);
  }
  return {
    recovery: summarizeIC(buckets.recovery),
    overheat: summarizeIC(buckets.overheat),
    stagflation: summarizeIC(buckets.stagflation),
    contraction: summarizeIC(buckets.contraction),
  };
}

/**
 * 端到端因子研究：网格 → 因子面板 → 前向收益 → 各因子 IC/分层 + 相关矩阵 + 中性化对照。
 * factorKeys 至少一个；无效 key 抛错。
 */
export async function runFactorResearch(
  factorKeys: readonly string[],
  opts: FactorResearchOptions = {},
): Promise<FactorResearchReport> {
  if (!factorKeys.length) throw new Error("至少选择一个因子");
  for (const k of factorKeys) {
    if (!FACTOR_MAP.has(k)) throw new Error(`未知因子：${k}`);
  }
  const q = opts.quantiles ?? DEFAULT_QUANTILES;
  if (!Number.isInteger(q) || q < 2 || q > 10) throw new Error("分层组数须为 2–10 的整数");

  const gridDates = await listResearchGrid({ start: opts.start, end: opts.end });
  if (gridDates.length < 2) {
    throw new Error(`研究区间内网格期数不足（${gridDates.length}），无法算前向收益`);
  }

  const panel = await loadFactorPanel(factorKeys, gridDates);
  const symbols = await symbolsInPanel(panel);
  const closes = await loadGridCloses(symbols, gridDates);
  const fwdReturns = buildForwardReturns(closes, gridDates);
  const regimeByDate = await loadRegimeMap(gridDates);

  const factors: FactorResearchResult[] = factorKeys.map((factorKey) => {
    const def = FACTOR_MAP.get(factorKey)!;
    const periods: FactorICPeriod[] = [];
    const layerPeriods: { factorValues: (number | null)[]; fwdReturns: (number | null)[] }[] = [];
    const neutralIcs: (number | null)[] = [];
    for (let i = 0; i < gridDates.length; i++) {
      const date = gridDates[i]!;
      const nextDate = i + 1 < gridDates.length ? gridDates[i + 1]! : null;
      const bySymbol = panel.get(date)?.get(factorKey) ?? new Map();
      const aligned = alignSeries(bySymbol, fwdReturns, i, "zscore");
      const ic = spearmanIC(aligned.factorValues, aligned.fwdReturns);
      periods.push({ date, nextDate, ic, n: aligned.n });
      layerPeriods.push({ factorValues: aligned.factorValues, fwdReturns: aligned.fwdReturns });
      const neutralAligned = alignSeries(bySymbol, fwdReturns, i, "sectorZscore");
      neutralIcs.push(spearmanIC(neutralAligned.factorValues, neutralAligned.fwdReturns));
    }
    return {
      factorKey,
      nameZh: def.nameZh,
      nameEn: def.nameEn,
      category: def.category,
      higherIsBetter: def.higherIsBetter,
      metric: "zscore",
      quantiles: q,
      periods,
      cumulativeIC: cumulativeIC(periods.map((p) => p.ic)),
      icSummary: summarizeIC(periods.map((p) => p.ic)),
      layering: summarizeLayering(layerPeriods, q),
      neutralizedIcSummary: summarizeIC(neutralIcs),
      icByRegime: icByRegimeOf(periods, regimeByDate),
    };
  });

  const correlation = computeCorrelation(panel, gridDates, factorKeys);

  return {
    start: gridDates[0]!,
    end: gridDates[gridDates.length - 1]!,
    gridDates,
    symbolCount: symbols.length,
    factors,
    correlation,
    regimeByDate: Object.fromEntries(regimeByDate) as Record<string, RegimeQuadrant>,
    regimeAvailable: regimeByDate.size > 0,
  };
}

/**
 * 选股器条件模型 + 查询引擎（Phase 2 WS1，纯函数）。
 *
 * - 输入 = 某月末截面的长表行（FactorSnapshot）pivot 成的宽行 + ScreenerConfig；
 *   不触库，DB 装配在 screenerData.ts —— 单测可离线跑。
 * - ScreenerConfig 的 JSON 结构是 Phase 3 回测引擎的直接输入，字段命名保持稳定，
 *   新增字段只加不改。
 * - null 语义：条件/排序涉及的因子指标为 null → 整行剔除并按 factorKey 计数上报
 *   （基本面因子 2021 前全 null，剔除计数是 UI 提示的依据）。
 * - percentile 指标不落库，现场从「宇宙过滤后」的截面按因子值算 0–1 分位
 *   （与 dollarVolPctile 同法，并列取平均秩）。
 * - marketCap 由 logMarketCap 因子还原（exp(value)），与 PIT 市值同口径。
 */

import { FACTOR_MAP } from "@/lib/quant/factorRegistry";
import { percentileRanks } from "@/lib/quant/factorCompute";

// ────────────────────────────────────────────────────────── 配置模型

export type ScreenerMetric = "value" | "zscore" | "sectorZscore" | "percentile";
export type ScreenerOp = "gte" | "lte" | "between";

export type ScreenerBounds = {
  min?: number | null;
  max?: number | null;
};

export type ScreenerCondition = {
  factorKey: string;
  metric: ScreenerMetric;
  op: ScreenerOp;
  /** gte 用 min，lte 用 max，between 两者都要（闭区间） */
  bounds: ScreenerBounds;
};

export type ScreenerUniverse = {
  /** GICS sector 多选（现值口径）；缺省不过滤。选中时 sector 为 null 的行剔除 */
  sectors?: string[];
  /** 最小 PIT 市值（美元）；设置时 marketCap 为 null 的行剔除 */
  minMarketCap?: number | null;
};

export type CompositeWeight = {
  factorKey: string;
  weight: number;
};

export type ScreenerRanking = {
  mode: "single" | "composite";
  /** single 模式排序因子；缺省不排序（保持 symbol 序） */
  sortFactor?: string | null;
  /** composite 模式权重表；复合分 = Σ weight × zscore × (higherIsBetter ? 1 : -1) */
  weights?: CompositeWeight[];
  /** 结果截断；缺省全量返回 */
  topN?: number | null;
};

export type ScreenerConfig = {
  /** YYYY-MM-DD；缺省 = 最新期（数据层解析为 ≤ 该日的最近截面日） */
  date?: string | null;
  universe?: ScreenerUniverse;
  conditions: ScreenerCondition[];
  ranking: ScreenerRanking;
};

// ────────────────────────────────────────────────────────── 截面输入/输出

export type FactorCell = {
  value: number | null;
  zscore: number | null;
  sectorZscore: number | null;
};

export type ScreenerInputRow = {
  symbol: string;
  name: string | null;
  /** EquitySecurity 现值 GICS sector（退市股可能为 null） */
  sector: string | null;
  factors: Record<string, FactorCell | undefined>;
};

export type ScreenerOutputCell = FactorCell & {
  /** 仅条件引用 percentile 指标的因子才计算并回填 */
  percentile?: number | null;
};

export type ScreenerResultRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  /** exp(logMarketCap)；2021 前截面无基本面时为 null */
  marketCap: number | null;
  /** composite 模式 = 加权复合分；single/不排序 = null */
  score: number | null;
  /** 仅含配置引用到的 factorKey（条件 + 排序 + 权重） */
  factors: Record<string, ScreenerOutputCell>;
};

export type ScreenerStats = {
  /** 截面总行数（宇宙过滤前） */
  universeTotal: number;
  excludedBySector: number;
  excludedByMarketCap: number;
  /** 因条件/排序所需指标为 null 而剔除的行数（一行只计一次） */
  droppedNull: number;
  /** factorKey → 该因子指标为 null 导致剔除的行数（一行可命中多个因子） */
  excludedByNull: Record<string, number>;
  /** 数据齐全但未通过条件的行数 */
  filteredOut: number;
  /** 通过全部过滤（截断 topN 前）的行数 */
  matched: number;
  returned: number;
};

export type ScreenerRunResult = {
  rows: ScreenerResultRow[];
  stats: ScreenerStats;
};

// ────────────────────────────────────────────────────────── 校验

export function validateScreenerConfig(config: ScreenerConfig): void {
  if (!Array.isArray(config.conditions)) throw new Error("conditions 必须是数组");
  if (config.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(config.date)) {
    throw new Error(`date 格式应为 YYYY-MM-DD：${config.date}`);
  }
  for (const c of config.conditions) {
    if (!FACTOR_MAP.has(c.factorKey)) throw new Error(`未知因子：${c.factorKey}`);
    if (!["value", "zscore", "sectorZscore", "percentile"].includes(c.metric)) {
      throw new Error(`未知指标口径：${c.metric}`);
    }
    if (!["gte", "lte", "between"].includes(c.op)) throw new Error(`未知比较符：${c.op}`);
    const { min, max } = c.bounds ?? {};
    if (c.op === "gte" && !isFiniteNum(min)) throw new Error(`${c.factorKey}: gte 需要 bounds.min`);
    if (c.op === "lte" && !isFiniteNum(max)) throw new Error(`${c.factorKey}: lte 需要 bounds.max`);
    if (c.op === "between") {
      if (!isFiniteNum(min) || !isFiniteNum(max)) {
        throw new Error(`${c.factorKey}: between 需要 bounds.min 与 bounds.max`);
      }
      if (min! > max!) throw new Error(`${c.factorKey}: between 的 min 不能大于 max`);
    }
  }
  const r = config.ranking;
  if (!r || (r.mode !== "single" && r.mode !== "composite")) {
    throw new Error("ranking.mode 必须为 single 或 composite");
  }
  if (r.mode === "single" && r.sortFactor != null && !FACTOR_MAP.has(r.sortFactor)) {
    throw new Error(`未知排序因子：${r.sortFactor}`);
  }
  if (r.mode === "composite") {
    if (!r.weights?.length) throw new Error("composite 模式需要非空 weights");
    for (const w of r.weights) {
      if (!FACTOR_MAP.has(w.factorKey)) throw new Error(`未知权重因子：${w.factorKey}`);
      if (!isFiniteNum(w.weight)) throw new Error(`${w.factorKey}: weight 必须是有限数`);
    }
  }
  if (r.topN != null && (!Number.isInteger(r.topN) || r.topN <= 0)) {
    throw new Error("topN 必须是正整数");
  }
  const mmc = config.universe?.minMarketCap;
  if (mmc != null && (!isFiniteNum(mmc) || mmc < 0)) {
    throw new Error("minMarketCap 必须是非负数");
  }
}

function isFiniteNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** 配置引用到的全部 factorKey（条件 + 排序 + 权重），输出宽行按此裁剪 */
export function referencedFactorKeys(config: ScreenerConfig): string[] {
  const keys = new Set<string>();
  for (const c of config.conditions) keys.add(c.factorKey);
  if (config.ranking.mode === "single" && config.ranking.sortFactor) {
    keys.add(config.ranking.sortFactor);
  }
  if (config.ranking.mode === "composite") {
    for (const w of config.ranking.weights ?? []) keys.add(w.factorKey);
  }
  return [...keys];
}

// ────────────────────────────────────────────────────────── pivot

export type FactorLongRow = {
  symbol: string;
  factorKey: string;
  value: number | null;
  zscore: number | null;
  sectorZscore: number | null;
};

export type SecurityMeta = {
  name: string | null;
  sector: string | null;
};

/** 长表 → 宽行；meta 缺失的 symbol 名称/行业置 null（退市且未回填的极端情形） */
export function pivotFactorRows(
  longRows: FactorLongRow[],
  metaBySymbol: ReadonlyMap<string, SecurityMeta>,
): ScreenerInputRow[] {
  const bySymbol = new Map<string, ScreenerInputRow>();
  for (const r of longRows) {
    let row = bySymbol.get(r.symbol);
    if (!row) {
      const meta = metaBySymbol.get(r.symbol);
      row = {
        symbol: r.symbol,
        name: meta?.name ?? null,
        sector: meta?.sector ?? null,
        factors: {},
      };
      bySymbol.set(r.symbol, row);
    }
    row.factors[r.factorKey] = {
      value: r.value,
      zscore: r.zscore,
      sectorZscore: r.sectorZscore,
    };
  }
  return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// ────────────────────────────────────────────────────────── 引擎

export function marketCapOf(row: ScreenerInputRow): number | null {
  const v = row.factors["logMarketCap"]?.value;
  return v != null && Number.isFinite(v) ? Math.exp(v) : null;
}

/**
 * 在已 pivot 的截面宽行上执行筛选。纯函数：同输入必同输出。
 * 剔除顺序：宇宙（sector → 市值）→ null 剔除 → 条件过滤 → 排序 → topN。
 */
export function runScreener(
  rows: ScreenerInputRow[],
  config: ScreenerConfig,
): ScreenerRunResult {
  validateScreenerConfig(config);

  const stats: ScreenerStats = {
    universeTotal: rows.length,
    excludedBySector: 0,
    excludedByMarketCap: 0,
    droppedNull: 0,
    excludedByNull: {},
    filteredOut: 0,
    matched: 0,
    returned: 0,
  };

  // 1) 宇宙过滤
  const sectorSet = config.universe?.sectors?.length
    ? new Set(config.universe.sectors)
    : null;
  const minMarketCap = config.universe?.minMarketCap ?? null;
  const universeRows: { row: ScreenerInputRow; marketCap: number | null }[] = [];
  for (const row of rows) {
    if (sectorSet && (row.sector == null || !sectorSet.has(row.sector))) {
      stats.excludedBySector++;
      continue;
    }
    const marketCap = marketCapOf(row);
    if (minMarketCap != null && (marketCap == null || marketCap < minMarketCap)) {
      stats.excludedByMarketCap++;
      continue;
    }
    universeRows.push({ row, marketCap });
  }

  // 2) percentile 现算（宇宙过滤后的截面，按因子 value 排位）
  const percentileKeys = [
    ...new Set(
      config.conditions.filter((c) => c.metric === "percentile").map((c) => c.factorKey),
    ),
  ];
  const percentileBySymbol = new Map<string, Record<string, number | null>>();
  for (const key of percentileKeys) {
    const values = universeRows.map(({ row }) => row.factors[key]?.value ?? null);
    const ranks = percentileRanks(values);
    universeRows.forEach(({ row }, i) => {
      let rec = percentileBySymbol.get(row.symbol);
      if (!rec) {
        rec = {};
        percentileBySymbol.set(row.symbol, rec);
      }
      rec[key] = ranks[i] ?? null;
    });
  }

  const metricOf = (
    row: ScreenerInputRow,
    factorKey: string,
    metric: ScreenerMetric,
  ): number | null => {
    if (metric === "percentile") {
      return percentileBySymbol.get(row.symbol)?.[factorKey] ?? null;
    }
    const cell = row.factors[factorKey];
    const v = cell?.[metric];
    return v != null && Number.isFinite(v) ? v : null;
  };

  // 排序/打分所需指标（null 同样剔除并计数）
  const rankingNeeds: { factorKey: string; metric: ScreenerMetric }[] = [];
  if (config.ranking.mode === "single" && config.ranking.sortFactor) {
    rankingNeeds.push({ factorKey: config.ranking.sortFactor, metric: "value" });
  }
  if (config.ranking.mode === "composite") {
    for (const w of config.ranking.weights ?? []) {
      rankingNeeds.push({ factorKey: w.factorKey, metric: "zscore" });
    }
  }

  // 3) null 剔除 + 条件过滤
  const outKeys = referencedFactorKeys(config);
  const passed: { row: ScreenerInputRow; marketCap: number | null; score: number | null }[] = [];
  for (const { row, marketCap } of universeRows) {
    const nullKeys = new Set<string>();
    for (const c of config.conditions) {
      if (metricOf(row, c.factorKey, c.metric) == null) nullKeys.add(c.factorKey);
    }
    for (const n of rankingNeeds) {
      if (metricOf(row, n.factorKey, n.metric) == null) nullKeys.add(n.factorKey);
    }
    if (nullKeys.size) {
      stats.droppedNull++;
      for (const k of nullKeys) {
        stats.excludedByNull[k] = (stats.excludedByNull[k] ?? 0) + 1;
      }
      continue;
    }

    let ok = true;
    for (const c of config.conditions) {
      const x = metricOf(row, c.factorKey, c.metric)!;
      if (c.op === "gte" && !(x >= c.bounds.min!)) ok = false;
      else if (c.op === "lte" && !(x <= c.bounds.max!)) ok = false;
      else if (c.op === "between" && !(x >= c.bounds.min! && x <= c.bounds.max!)) ok = false;
      if (!ok) break;
    }
    if (!ok) {
      stats.filteredOut++;
      continue;
    }

    let score: number | null = null;
    if (config.ranking.mode === "composite") {
      score = 0;
      for (const w of config.ranking.weights!) {
        const dir = FACTOR_MAP.get(w.factorKey)!.higherIsBetter ? 1 : -1;
        score += w.weight * metricOf(row, w.factorKey, "zscore")! * dir;
      }
    }
    passed.push({ row, marketCap, score });
  }
  stats.matched = passed.length;

  // 4) 排序（并列按 symbol 保证确定性）
  if (config.ranking.mode === "composite") {
    passed.sort(
      (a, b) => b.score! - a.score! || a.row.symbol.localeCompare(b.row.symbol),
    );
  } else if (config.ranking.sortFactor) {
    const key = config.ranking.sortFactor;
    const dir = FACTOR_MAP.get(key)!.higherIsBetter ? 1 : -1;
    passed.sort(
      (a, b) =>
        (b.row.factors[key]!.value! - a.row.factors[key]!.value!) * dir ||
        a.row.symbol.localeCompare(b.row.symbol),
    );
  }

  // 5) topN 截断 + 输出裁剪
  const limited =
    config.ranking.topN != null ? passed.slice(0, config.ranking.topN) : passed;
  stats.returned = limited.length;

  const out: ScreenerResultRow[] = limited.map(({ row, marketCap, score }) => {
    const factors: Record<string, ScreenerOutputCell> = {};
    for (const k of outKeys) {
      const cell = row.factors[k];
      const outCell: ScreenerOutputCell = {
        value: cell?.value ?? null,
        zscore: cell?.zscore ?? null,
        sectorZscore: cell?.sectorZscore ?? null,
      };
      if (percentileKeys.includes(k)) {
        outCell.percentile = percentileBySymbol.get(row.symbol)?.[k] ?? null;
      }
      factors[k] = outCell;
    }
    return {
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      marketCap,
      score,
      factors,
    };
  });

  return { rows: out, stats };
}

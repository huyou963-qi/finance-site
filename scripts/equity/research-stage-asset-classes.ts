/**
 * 历史阶段 × 大类资产：连续宏观因子 z、路径依赖与领先-滞后关系的研究（可复跑）。
 *
 *   npm run equity:research-stage-assets                          # 阶段口径 + 月度口径（默认）
 *   npm run equity:research-stage-assets -- --min-months=3         # 稳健性：剔除过短阶段
 *   npm run equity:research-stage-assets -- --long                 # regime 重算到 1971，长样本复核
 *   npm run equity:research-stage-assets -- --leadlag --winsor=0.02  # 反过来测：资产是否领先于 regime 确认
 *   npm run equity:research-stage-assets -- --perm=5000
 *
 * `--leadlag` 是三种模式里方向不同的一种：前两种都在测「regime 能否解释/预测资产收益」，
 * `--leadlag` 测「资产价格的拐点是否领先于 regime 的确认转折」——资产前瞻、噪音大，
 * 宏观硬数据滞后但起二次确认作用，是更符合市场常识的因果方向。方法与结论见
 * docs/research/US_SECTOR_STAGE_ASSET_CLASSES.md 第 5 节。
 *
 * 为什么不用四象限：把连续的 growthZ / inflationMomZ 砍成 above/below、rising/falling 会丢掉
 * 幅度信息，30 个阶段本来样本就少，离散化后每格 2–11 个观测，检验功效几乎为零（前一版四象限
 * 置换检验最小 p=0.376，多重检验后全灭）。本脚本改回连续回归，并按用户提出的两点补足：
 *   1. 同期 Δz（顺风/逆风的**幅度与方向**）vs 期初 z 水平（可事前观测，才谈得上前瞻）；
 *   2. 路径依赖：阶段起点的超跌深度（相对过去 36 个月最高净值的回撤）与前 12 个月收益。
 *      假说是「跌久了的资产在顺风到来时反弹更猛」→ dd0 系数应为负，且 dg×dd0 交互项显著。
 *
 * 口径要点：
 * - 因变量 = 月度等价收益 (1+r)^(1/months)-1。阶段长度 1–24 个月，直接用总收益会让长阶段自动
 *   赢，用年化会把 2020-02→03 单月阶段炸成 ±400%。
 * - WLS 权重 = 阶段月数：月度等价收益的方差约 ∝ 1/months，短阶段本就更吵，不该等权。
 * - 自变量全部标准化（组内 z-score），系数读作「每 1 个标准差自变量对应 %/月」。
 * - 宏观 z 取 PIT：阶段起止日**当时可见**的最近一期 macro_regime（该表本身即 as-of 快照）。
 * - 显著性用 Freedman–Lane 置换（对偏系数的正确检验，不假设正态），再按族做 BH-FDR。
 *
 * 结论与限制写入 docs/research/US_SECTOR_STAGE_ASSET_CLASSES.md，勿在别处复述。
 */
import { getDailyClosesDbFirst } from "../../src/lib/equity/equityPriceStore";
import { MACRO_ASSET_CLASSES } from "../../src/lib/equity/macroAssetClasses";
import { SECTOR_HISTORICAL_PERIODS } from "../../src/lib/equity/sectorHistoricalPeriods";
import { BENCHMARK_ETF } from "../../src/lib/equity/gicsCatalog";
import {
  computeRegimeSeries,
  listStoredRegimes,
  type MacroRegimePoint,
} from "../../src/lib/quant/macroRegime";
import { prisma } from "../../src/lib/prisma";
import type { ClosePoint } from "../../src/lib/equity/sectorReturns";

const DAY = 86400;
const MONTH_SEC = (365.25 / 12) * DAY;

function argNumber(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  const value = hit ? Number(hit.slice(name.length + 1)) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

const MIN_MONTHS = argNumber("--min-months", 0);
/** --long：把 regime 重算到 1971（macro_regime 落库的 2000 起只是因子网格的起点，不是数据下限） */
const LONG_RUN = process.argv.includes("--long");
const LONG_START = (process.argv.find((a) => a.startsWith("--long-start="))?.slice(13) ?? "1971-01");
/** --leadlag：资产拐点是否领先于 regime 确认（用户假说：资产领先、基本面滞后确认） */
const LEADLAG_RUN = process.argv.includes("--leadlag");
/** 月度收益的双侧缩尾比例；用于检验结论是否只靠 2008/2020 的少数极端月 */
const WINSOR = Math.min(0.1, Math.max(0, argNumber("--winsor", 0)));
const PERM = Math.max(200, argNumber("--perm", 2000));
const SEED_STATE = { s: 20260906 };
/** 可复现的伪随机（同一命令两次跑出同样的 p） */
function rand(): number {
  SEED_STATE.s = (SEED_STATE.s * 1103515245 + 12345) & 0x7fffffff;
  return SEED_STATE.s / 0x7fffffff;
}

function dateToSec(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 1000;
}

// ───────────────────────────────────────────── 阶段面板

type StageAssetCell = {
  /** 月度等价收益 */
  monthly: number;
  months: number;
  /** 阶段起点相对过去 36 个月最高收盘的回撤（≤0） */
  drawdown: number | null;
  /** 阶段起点前 12 个月收益 */
  prior12m: number | null;
};

/** 首尾必须贴住阶段边界，容差同前端 stageWindowReturn */
function stageCell(
  points: readonly ClosePoint[] | undefined,
  fromSec: number,
  toSec: number,
): StageAssetCell | null {
  if (!points?.length || toSec <= fromSec) return null;
  const tolerance = Math.min(15 * DAY, (toSec - fromSec) * 0.2);
  let firstIndex = -1;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (p.time >= fromSec && p.time <= toSec) {
      firstIndex = i;
      break;
    }
  }
  let lastIndex = -1;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i]!;
    if (p.time <= toSec && p.time >= fromSec) {
      lastIndex = i;
      break;
    }
  }
  if (firstIndex < 0 || lastIndex <= firstIndex) return null;
  const first = points[firstIndex]!;
  const last = points[lastIndex]!;
  if (!first.close || first.time - fromSec > tolerance || toSec - last.time > tolerance) {
    return null;
  }
  const months = (last.time - first.time) / MONTH_SEC;
  if (months <= 0) return null;

  // 路径依赖变量：只看阶段起点之前的历史，天然无前视
  let peak = 0;
  let priorCount = 0;
  let priceOneYearBefore: number | null = null;
  const windowStart = first.time - 36 * MONTH_SEC;
  const yearBefore = first.time - 12 * MONTH_SEC;
  for (let i = firstIndex - 1; i >= 0; i -= 1) {
    const p = points[i]!;
    if (p.time < windowStart) break;
    priorCount += 1;
    if (p.close > peak) peak = p.close;
    if (priceOneYearBefore == null && p.time <= yearBefore) priceOneYearBefore = p.close;
  }
  // 少于约两年可用历史时不给路径变量，避免用上市初期的短窗口冒充「超跌」
  const hasPath = priorCount >= 480;
  return {
    monthly: Math.pow(last.close / first.close, 1 / months) - 1,
    months,
    drawdown: hasPath && peak > 0 ? first.close / peak - 1 : null,
    prior12m:
      hasPath && priceOneYearBefore ? first.close / priceOneYearBefore - 1 : null,
  };
}

// ───────────────────────────────────────────── 加权最小二乘

type Fit = {
  beta: number[];
  t: number[];
  fitted: number[];
  residual: number[];
  r2: number;
  r2adj: number;
  n: number;
};

/**
 * 解正规方程（列数极小，直接高斯–若尔当消元；奇异返回 null）。
 * 注意：消元赋值必须写成 `target[k] = target[k]! - ...`，不能写 `m[r]![k]! -= ...`——
 * 后者的非空断言出现在赋值左值上，转译后整列会变成 NaN，且不会报错。
 */
function solveSymmetric(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m: number[][] = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    const swap = m[col]!;
    m[col] = m[pivot]!;
    m[pivot] = swap;
    const pivotRow = m[col]!;
    const pv = pivotRow[col]!;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const target = m[row]!;
      const factor = target[col]! / pv;
      if (!factor) continue;
      for (let k = col; k <= n; k += 1) target[k] = target[k]! - factor * pivotRow[k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

function invertSymmetric(a: number[][]): number[][] | null {
  const n = a.length;
  const out: number[][] = [];
  for (let col = 0; col < n; col += 1) {
    const unit = new Array(n).fill(0);
    unit[col] = 1;
    const solved = solveSymmetric(a.map((row) => [...row]), unit);
    if (!solved) return null;
    out.push(solved);
  }
  // out 目前是按列存的逆，转置回来
  return out[0]!.map((_, i) => out.map((col) => col[i]!));
}

/** X 含截距列；weights 为观测权重 */
function wls(X: number[][], y: number[], w: number[]): Fit | null {
  const n = y.length;
  const p = X[0]!.length;
  if (n <= p + 1) return null;
  const xtwx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const xtwy: number[] = new Array(p).fill(0);
  for (let i = 0; i < n; i += 1) {
    const wi = w[i]!;
    const xi = X[i]!;
    for (let a = 0; a < p; a += 1) {
      xtwy[a] = xtwy[a]! + wi * xi[a]! * y[i]!;
      const rowA = xtwx[a]!;
      for (let b = 0; b < p; b += 1) rowA[b] = rowA[b]! + wi * xi[a]! * xi[b]!;
    }
  }
  const beta = solveSymmetric(xtwx.map((row) => [...row]), xtwy);
  if (!beta) return null;
  const inv = invertSymmetric(xtwx);
  if (!inv) return null;

  const fitted = X.map((row) => row.reduce((s, v, k) => s + v * beta[k]!, 0));
  const residual = y.map((v, i) => v - fitted[i]!);
  const sse = residual.reduce((s, e, i) => s + w[i]! * e * e, 0);
  const wsum = w.reduce((s, v) => s + v, 0);
  const ybar = y.reduce((s, v, i) => s + w[i]! * v, 0) / wsum;
  const sst = y.reduce((s, v, i) => s + w[i]! * (v - ybar) ** 2, 0);
  const sigma2 = sse / (n - p);
  const t = beta.map((b, k) => {
    const se = Math.sqrt(Math.max(sigma2 * inv[k]![k]!, 1e-300));
    return se > 0 ? b / se : 0;
  });
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  return {
    beta,
    t,
    fitted,
    residual,
    r2,
    r2adj: 1 - (1 - r2) * ((n - 1) / (n - p)),
    n,
  };
}

/**
 * Freedman–Lane：检验第 j 个自变量的偏效应。
 * 在「去掉 j 的缩减模型」残差上做置换，保留其余自变量的结构，比直接打乱 y 更严格。
 */
function freedmanLaneP(
  X: number[][],
  y: number[],
  w: number[],
  j: number,
  observedT: number,
): number {
  const reducedX = X.map((row) => row.filter((_, k) => k !== j));
  const reduced = wls(reducedX, y, w);
  if (!reduced) return NaN;
  let ge = 0;
  const order = y.map((_, i) => i);
  for (let iter = 0; iter < PERM; iter += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const k = Math.floor(rand() * (i + 1));
      [order[i], order[k]] = [order[k]!, order[i]!];
    }
    const yStar = y.map((_, i) => reduced.fitted[i]! + reduced.residual[order[i]!]!);
    const fit = wls(X, yStar, w);
    if (fit && Math.abs(fit.t[j]!) >= Math.abs(observedT)) ge += 1;
  }
  return (ge + 1) / (PERM + 1);
}

/**
 * 循环分块置换：自变量高度持续（z 水平、回撤）时，i.i.d. 打乱会低估 p——
 * 打乱后的 y 失去自相关，随机匹配上持续型 x 的机会变小，检验偏松。
 * 按 blockLen 个月为整块循环搬移，保留 y 的自相关结构，只切断与 x 的对应关系。
 */
function blockPermutationP(
  X: number[][],
  y: number[],
  w: number[],
  j: number,
  observedT: number,
  blockLen: number,
): number {
  const reducedX = X.map((row) => row.filter((_, k) => k !== j));
  const reduced = wls(reducedX, y, w);
  if (!reduced) return NaN;
  const n = y.length;
  const nBlocks = Math.ceil(n / blockLen);
  let ge = 0;
  for (let iter = 0; iter < PERM; iter += 1) {
    const shuffled: number[] = [];
    for (let b = 0; b < nBlocks; b += 1) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < blockLen && shuffled.length < n; k += 1) {
        shuffled.push(reduced.residual[(start + k) % n]!);
      }
    }
    const yStar = y.map((_, i) => reduced.fitted[i]! + shuffled[i]!);
    const fit = wls(X, yStar, w);
    if (fit && Math.abs(fit.t[j]!) >= Math.abs(observedT)) ge += 1;
  }
  return (ge + 1) / (PERM + 1);
}

/** 双侧缩尾：把极端月拉回分位点，不删样本 */
function winsorize(values: number[]): number[] {
  if (WINSOR <= 0) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(WINSOR * (sorted.length - 1))]!;
  const hi = sorted[Math.ceil((1 - WINSOR) * (sorted.length - 1))]!;
  return values.map((v) => Math.min(hi, Math.max(lo, v)));
}

function standardize(values: number[]): number[] {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, values.length - 1),
  );
  return sd > 0 ? values.map((v) => (v - mean) / sd) : values.map(() => 0);
}

function benjaminiHochberg(pValues: number[], q: number): boolean[] {
  const order = pValues
    .map((p, i) => ({ p, i }))
    .filter((x) => Number.isFinite(x.p))
    .sort((a, b) => a.p - b.p);
  const m = order.length;
  let cutoff = -1;
  order.forEach((x, rank) => {
    if (x.p <= ((rank + 1) / m) * q) cutoff = rank;
  });
  const pass = new Array(pValues.length).fill(false);
  order.forEach((x, rank) => {
    if (rank <= cutoff) pass[x.i] = true;
  });
  return pass;
}

// ───────────────────────────────────────────── 主流程

type Model = {
  id: string;
  label: string;
  /** 自变量名（不含截距） */
  terms: string[];
  family: string;
};

const MODELS: Model[] = [
  { id: "A", label: "同期宏观（解释性，不可事前观测）", terms: ["dGrowthZ", "dInflZ"], family: "A" },
  { id: "B", label: "期初宏观水平（前瞻）", terms: ["growthZ0", "inflZ0"], family: "B" },
  { id: "C", label: "路径依赖：期初超跌（前瞻）", terms: ["drawdown0"], family: "C" },
  { id: "D", label: "同期宏观 + 期初超跌", terms: ["dGrowthZ", "dInflZ", "drawdown0"], family: "D" },
  { id: "E", label: "顺风 × 超跌交互（探索）", terms: ["dGrowthZ", "drawdown0", "dGrowthZ:drawdown0"], family: "E" },
  { id: "F", label: "期初超跌 + 前 12 月动量（前瞻）", terms: ["drawdown0", "prior12m"], family: "F" },
];

type Row = Record<string, number> & { asset: string; stage: string };

async function main() {
  const assets = [
    { id: "spy", nameZh: "美股 SPY", symbol: BENCHMARK_ETF },
    ...MACRO_ASSET_CLASSES.map((a) => ({ id: a.id, nameZh: a.nameZh, symbol: a.symbol })),
  ];
  const { closes } = await getDailyClosesDbFirst(
    assets.map((a) => a.symbol),
    12_000,
  );
  const regimes = await listStoredRegimes({});
  const macro = regimes
    .map((r) => {
      const inputs = r.inputs as unknown as {
        growthZ: number | null;
        inflationMomZ: number | null;
        components?: { cpiYoY?: number | null };
      };
      return {
        date: r.date,
        growthZ: inputs.growthZ,
        inflZ: inputs.inflationMomZ,
        cpiYoY: inputs.components?.cpiYoY ?? null,
      };
    })
    .filter((m) => m.growthZ != null && m.inflZ != null);

  /** PIT：取 ≤ 给定日的最近一期宏观快照 */
  function macroAsOf(dateIso: string) {
    let hit: (typeof macro)[number] | null = null;
    for (const m of macro) {
      if (m.date <= dateIso) hit = m;
      else break;
    }
    return hit;
  }

  const spyLast = closes[BENCHMARK_ETF]?.at(-1)?.time ?? Math.floor(Date.now() / 1000);
  const rows: Row[] = [];
  const stageMeta: Array<Record<string, string | number>> = [];

  for (const period of SECTOR_HISTORICAL_PERIODS) {
    const fromSec = dateToSec(period.start);
    const toSec = Math.min(dateToSec(period.end) + DAY - 1, spyLast);
    const endIso = new Date(toSec * 1000).toISOString().slice(0, 10);
    const start = macroAsOf(period.start);
    const end = macroAsOf(endIso);
    if (!start || !end) continue;

    const spyCell = stageCell(closes[BENCHMARK_ETF], fromSec, toSec);
    if (!spyCell || spyCell.months < MIN_MONTHS) continue;
    const months = spyCell.months;

    stageMeta.push({
      stage: period.shortLabel,
      months: Number(months.toFixed(1)),
      growthZ0: Number(start.growthZ!.toFixed(2)),
      dGrowthZ: Number((end.growthZ! - start.growthZ!).toFixed(2)),
      inflZ0: Number(start.inflZ!.toFixed(2)),
      dInflZ: Number((end.inflZ! - start.inflZ!).toFixed(2)),
      spy: `${(spyCell.monthly * 100).toFixed(2)}%/月`,
    });

    for (const asset of assets) {
      const cell = stageCell(closes[asset.symbol], fromSec, toSec);
      if (!cell) continue;
      rows.push({
        asset: asset.id,
        stage: period.id,
        y: cell.monthly,
        months: cell.months,
        growthZ0: start.growthZ!,
        inflZ0: start.inflZ!,
        dGrowthZ: (end.growthZ! - start.growthZ!) / cell.months,
        dInflZ: (end.inflZ! - start.inflZ!) / cell.months,
        drawdown0: cell.drawdown ?? NaN,
        prior12m: cell.prior12m ?? NaN,
      } as Row);
    }
  }

  console.log(`# 阶段面板（可用 ${stageMeta.length} / ${SECTOR_HISTORICAL_PERIODS.length} 段；`
    + `宏观 z 自 ${macro[0]?.date} 起，更早阶段无法标注）`);
  console.table(stageMeta);

  type Result = { asset: string; model: string; term: string; beta: number; p: number; r2adj: number; n: number };
  const results: Result[] = [];

  for (const model of MODELS) {
    console.log(`\n## 模型 ${model.id}：${model.label}   y = 月度等价收益(%/月)，WLS 权重=阶段月数`);
    const table: Array<Record<string, string | number>> = [];
    for (const asset of assets) {
      const sample = rows.filter(
        (r) => r.asset === asset.id && model.terms.every((t) => {
          const base = t.split(":");
          return base.every((b) => Number.isFinite(r[b]!));
        }),
      );
      if (sample.length < 12) {
        table.push({ 资产: asset.nameZh, n: sample.length, 说明: "样本不足" });
        continue;
      }
      const columns = model.terms.map((term) => {
        const parts = term.split(":");
        const raw = sample.map((r) => parts.reduce((v, p) => v * r[p]!, 1));
        return standardize(raw);
      });
      const X = sample.map((_, i) => [1, ...columns.map((c) => c[i]!)]);
      const y = sample.map((r) => r.y);
      const w = sample.map((r) => r.months);
      const fit = wls(X, y, w);
      if (!fit) {
        table.push({ 资产: asset.nameZh, n: sample.length, 说明: "共线，无法估计" });
        continue;
      }
      const row: Record<string, string | number> = {
        资产: asset.nameZh,
        n: fit.n,
        "R²adj": Number(fit.r2adj.toFixed(3)),
      };
      model.terms.forEach((term, k) => {
        const j = k + 1;
        const p = freedmanLaneP(X, y, w, j, fit.t[j]!);
        const beta = fit.beta[j]! * 100;
        row[term] = `${beta >= 0 ? "+" : ""}${beta.toFixed(2)} (p=${p.toFixed(3)})`;
        results.push({ asset: asset.nameZh, model: model.id, term, beta, p, r2adj: fit.r2adj, n: fit.n });
      });
      table.push(row);
    }
    console.table(table);
  }

  console.log("\n## 多重检验：按模型族做 BH-FDR (q=0.10)");
  const families = [...new Set(results.map((r) => r.model))];
  for (const family of families) {
    const subset = results.filter((r) => r.model === family);
    const pass = benjaminiHochberg(subset.map((r) => r.p), 0.1);
    const survivors = subset.filter((_, i) => pass[i]);
    console.log(
      `模型 ${family}：${subset.length} 个系数检验，通过 ${survivors.length} 个` +
        (survivors.length
          ? `\n  ${survivors
              .map((s) => `${s.asset}·${s.term} β=${s.beta >= 0 ? "+" : ""}${s.beta.toFixed(2)}%/月 p=${s.p.toFixed(3)}`)
              .join("\n  ")}`
          : ""),
    );
  }

  await monthlyPanel(assets, closes, macro);
}

// ───────────────────────────────────────────── 长样本模式

type MacroRow = {
  date: string;
  growthZ: number | null;
  inflZ: number | null;
  regime?: string | null;
  dalio?: string | null;
  growthDirection?: string | null;
  recession?: number;
};

/** 月末网格（含最后一个不完整月之前的所有月末） */
function monthEndGrid(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let [year, month] = startMonth.split("-").map(Number) as [number, number];
  const [endYear, endMonthNum] = endMonth.split("-").map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    const last = new Date(Date.UTC(year, month, 0));
    out.push(last.toISOString().slice(0, 10));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * 把统一事实库里的宏观价格序列（伦敦金现、FRED WTI 现货）当成价格点喂进同一套分析。
 * 这两条比 Yahoo 的 GC=F / CL=F（都只到 2000-08）早十几到三十年，是长样本的关键。
 * 只用于研究脚本，不进页面：页面上的黄金/原油仍走 equity_daily_bar 的期货连续合约。
 */
async function loadMacroPriceSeries(code: string): Promise<ClosePoint[]> {
  const rows = await prisma.$queryRaw<Array<{ obs_date: Date; value: unknown }>>`
    SELECT o.obs_date, o.value
    FROM mds."Instrument" i
    JOIN mds."MacroObservation" o ON o.instrument_id = i.id
    WHERE i.code = ${code} AND o.value IS NOT NULL
    ORDER BY o.obs_date ASC
  `;
  return rows
    .map((r) => ({ time: Math.floor(r.obs_date.getTime() / 1000), close: Number(r.value) }))
    .filter((p) => Number.isFinite(p.close) && p.close > 0);
}

const LONG_ASSETS = [
  { id: "spy", nameZh: "美股", symbol: "VFINX", note: "Vanguard 500 指数基金总收益 1980-01" },
  { id: "long-treasury", nameZh: "长期美债", symbol: "VUSTX", note: "1986-05" },
  { id: "short-treasury", nameZh: "短债/类现金", symbol: "VFISX", note: "1991-10" },
  { id: "tips", nameZh: "通胀挂钩债", symbol: "VIPSX", note: "2000-06（TIPS 1997 才发行）" },
  { id: "ig-credit", nameZh: "投资级信用债", symbol: "VWESX", note: "1980-01" },
  { id: "hy-credit", nameZh: "高收益债", symbol: "VWEHX", note: "1980-01" },
  { id: "gold", nameZh: "黄金", symbol: "GOLD_LONDON", note: "伦敦金现（统一事实库）" },
  { id: "crude-oil", nameZh: "WTI 原油", symbol: "WTI_SPOT", note: "FRED DCOILWTICO 1986-01" },
  { id: "commodities", nameZh: "商品综合", symbol: "^SPGSCI", note: "1984-01" },
  { id: "dollar", nameZh: "美元指数", symbol: "DX-Y.NYB", note: "1971-01" },
];

async function longRun() {
  console.log(`# 长样本模式：regime 重算自 ${LONG_START}（不落库，只用于研究）`);

  const yahooSymbols = LONG_ASSETS.map((a) => a.symbol).filter(
    (sym) => sym !== "GOLD_LONDON" && sym !== "WTI_SPOT",
  );
  const [{ closes }, gold, oil] = await Promise.all([
    getDailyClosesDbFirst(yahooSymbols, 20_000),
    loadMacroPriceSeries("goldov_c02_london_gold"),
    loadMacroPriceSeries("sched_fred_DCOILWTICO"),
  ]);
  closes.GOLD_LONDON = gold;
  closes.WTI_SPOT = oil;

  const latestMacroMonth = (await listStoredRegimes({})).at(-1)?.date.slice(0, 7) ?? "2026-07";
  const grid = monthEndGrid(LONG_START, latestMacroMonth);
  const started = Date.now();
  const points: MacroRegimePoint[] = await computeRegimeSeries(grid);
  const usable = points.filter((pt) => pt.inputs.growthZ != null && pt.inputs.inflationMomZ != null);
  console.log(
    `regime 网格 ${grid.length} 期，其中两维 z 均可用 ${usable.length} 期` +
      `（${usable[0]?.date} → ${usable.at(-1)?.date}），耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  const macro: MacroRow[] = usable.map((pt) => ({
    date: pt.date,
    growthZ: pt.inputs.growthZ,
    inflZ: pt.inputs.inflationMomZ,
    regime: pt.regime,
    dalio: pt.dalioRegime,
    growthDirection: pt.growthDirection,
    recession: pt.recession,
  }));

  const coverage = LONG_ASSETS.map((asset) => {
    const series = closes[asset.symbol] ?? [];
    const first = series[0];
    const last = series.at(-1);
    return {
      资产: asset.nameZh,
      代理: asset.symbol,
      起: first ? new Date(first.time * 1000).toISOString().slice(0, 10) : "—",
      止: last ? new Date(last.time * 1000).toISOString().slice(0, 10) : "—",
      说明: asset.note,
    };
  });
  console.log("\n## 长样本代理与覆盖");
  console.table(coverage);

  await quadrantPanel(LONG_ASSETS, closes, macro);
  await confirmationLagPanel(LONG_ASSETS, closes, macro);
  await monthlyPanel(LONG_ASSETS, closes, macro);
}

/**
 * 确认滞后扫描：象限对收益的区分度，在**滞后 L 个月才使用该标签**时还剩多少。
 *
 * 这是把「描述性相关」和「有指引性」分开的关键一步。dalioRegime 用 growthZ 的 MA3 平滑判方向、
 * 再过 minPhaseMonths=3 的最短相位删失，也就是说一个新象限要连续出现约 3 个月才被确认；
 * 若区分度在 L=1..3 就衰减掉，说明关系是同期共动（商品价格本身就是通胀与生产数据的输入），
 * 等你知道自己在哪个象限时行情已经走完，不能当择时依据。
 */
async function confirmationLagPanel(
  assets: Array<{ id: string; nameZh: string; symbol: string }>,
  closes: Record<string, ClosePoint[]>,
  macro: MacroRow[],
) {
  console.log(
    "\n## 确认滞后扫描（dalioRegime 象限极差 %/月，括号内为 12 月分块置换 p）\n" +
      "   L=0 是事后口径；象限本身需约 3 个月才确认，故 L≥3 才是能执行的口径。",
  );
  const byMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const months = [...byMonth.keys()].sort();
  const lags = [0, 1, 2, 3];
  const table: Array<Record<string, string | number>> = [];

  for (const asset of assets) {
    const ends = new Map<string, number>();
    for (const point of closes[asset.symbol] ?? []) {
      ends.set(new Date(point.time * 1000).toISOString().slice(0, 7), point.close);
    }
    const row: Record<string, string | number> = { 资产: asset.nameZh };
    let usable = true;
    for (const lag of lags) {
      const cells: Array<{ bucket: string; y: number }> = [];
      for (let i = 1; i < months.length; i += 1) {
        if (i - lag < 0) continue;
        const bucket = byMonth.get(months[i - lag]!)?.dalio;
        const now = ends.get(months[i]!);
        const before = ends.get(months[i - 1]!);
        if (!bucket || now == null || before == null || !before) continue;
        cells.push({ bucket, y: now / before - 1 });
      }
      if (cells.length < 120) {
        usable = false;
        break;
      }
      const winsorized = winsorize(cells.map((c) => c.y));
      cells.forEach((c, i) => {
        c.y = winsorized[i]!;
      });
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
      const buckets = [...new Set(cells.map((c) => c.bucket))];
      const groupMeans = buckets.map((b) => mean(cells.filter((c) => c.bucket === b).map((c) => c.y)));
      const observed = Math.max(...groupMeans) - Math.min(...groupMeans);
      const labels = cells.map((c) => c.bucket);
      const blockLen = 12;
      const blocks = Math.ceil(cells.length / blockLen);
      let ge = 0;
      for (let iter = 0; iter < PERM; iter += 1) {
        const shuffled: string[] = [];
        for (let b = 0; b < blocks; b += 1) {
          const start = Math.floor(rand() * cells.length);
          for (let k = 0; k < blockLen && shuffled.length < cells.length; k += 1) {
            shuffled.push(labels[(start + k) % cells.length]!);
          }
        }
        const ms = buckets
          .map((b) => mean(cells.filter((_, i) => shuffled[i] === b).map((c) => c.y)))
          .filter((v) => Number.isFinite(v));
        if (ms.length >= 2 && Math.max(...ms) - Math.min(...ms) >= observed) ge += 1;
      }
      row[`L=${lag}`] = `${(observed * 100).toFixed(2)} (p=${((ge + 1) / (PERM + 1)).toFixed(3)})`;
    }
    if (usable) table.push(row);
  }
  console.table(table);
}

// ═══════════════════════════════════════════ 领先-滞后：资产拐点 vs regime 确认

/**
 * `--leadlag`：把因果方向反过来测。
 *
 * 此前所有模式都在测「regime（已知/已滞后确认）能否解释或预测资产收益」——结论一贯是不能。
 * 用户提出的假说方向相反且更符合市场常识：**资产价格是前瞻的、噪音大，宏观硬数据滞后、
 * 起「二次确认」作用**。所以这里测三件更具体的事，并把方向也倒过来：
 *
 *   1. 商品/原油的收益是否单独由**通胀因子**（而非增长）驱动，且在哪个方向上领先/滞后；
 *   2. 黄金的表现是否符合「增长下 + 通胀下」（deflation 象限）这个具体假说——照实报告，
 *      即使数据与假说不符；
 *   3. 衰退里股票与短端利率是否**同步快速下行**（用户的具体描述），以及
 *   4. 把多个资产的趋势拐点叠加成一个扩散指数，看它是否领先于 regime 的确认转折
 *      （对应用户说的「大类资产间相互拐点走势叠加后取得基本面指标确认」）。
 *
 * 显著性方法：分类标签（象限）用分块置换（同前）；连续序列的领先-滞后关系改用
 * **循环移位置换**——把一条序列整体做随机循环平移再算相关，比分块置换更适合连续序列，
 * 因为它精确保留了该序列自身的自相关结构，只打断它与另一条序列的时间对齐。
 */
async function leadLagRun() {
  console.log(`# 领先-滞后模式：资产拐点是否领先于 regime 确认（regime 重算自 ${LONG_START}，不落库）`);

  const yahooSymbols = [
    ...LONG_ASSETS.map((a) => a.symbol).filter((sym) => sym !== "GOLD_LONDON" && sym !== "WTI_SPOT"),
    "^IRX",
  ];
  const [{ closes }, gold, oil] = await Promise.all([
    getDailyClosesDbFirst(yahooSymbols, 20_000),
    loadMacroPriceSeries("goldov_c02_london_gold"),
    loadMacroPriceSeries("sched_fred_DCOILWTICO"),
  ]);
  closes.GOLD_LONDON = gold;
  closes.WTI_SPOT = oil;

  const latestMacroMonth = (await listStoredRegimes({})).at(-1)?.date.slice(0, 7) ?? "2026-07";
  const grid = monthEndGrid(LONG_START, latestMacroMonth);
  const points: MacroRegimePoint[] = await computeRegimeSeries(grid);
  const usable = points.filter((pt) => pt.inputs.growthZ != null && pt.inputs.inflationMomZ != null);
  const macro: MacroRow[] = usable.map((pt) => ({
    date: pt.date,
    growthZ: pt.inputs.growthZ,
    inflZ: pt.inputs.inflationMomZ,
    regime: pt.regime,
    dalio: pt.dalioRegime,
    growthDirection: pt.growthDirection,
    recession: pt.recession,
  }));
  console.log(`regime 可用 ${macro.length} 期（${macro[0]?.date} → ${macro.at(-1)?.date}）`);

  await ccfPanel(LONG_ASSETS, closes, macro);
  await goldQuadrantHypothesis(closes, macro);
  await recessionCoMovePanel(closes, macro);
  await diffusionEventStudy(closes, macro);
}

function meanArr(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function pearsonCorr(x: number[], y: number[]): number {
  const mx = meanArr(x);
  const my = meanArr(y);
  let sxy = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sx += (x[i]! - mx) ** 2;
    sy += (y[i]! - my) ** 2;
  }
  return sxy / Math.sqrt(sx * sy);
}

/** 循环移位置换：整体随机平移 y 再算相关，保留 y 自身的自相关结构，只打断对齐关系。 */
function circularShiftP(x: number[], y: number[], observed: number): number {
  const n = y.length;
  if (n < 8) return NaN;
  let ge = 0;
  for (let iter = 0; iter < PERM; iter += 1) {
    const shift = 1 + Math.floor(rand() * (n - 1));
    const shifted = y.map((_, i) => y[(i + shift) % n]!);
    if (Math.abs(pearsonCorr(x, shifted)) >= Math.abs(observed)) ge += 1;
  }
  return (ge + 1) / (PERM + 1);
}

/** 月末收盘价 map（假定月度数据连续，从第一个可用月开始遇到缺口即截断） */
function monthEndLevels(points: ClosePoint[] | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of points ?? []) {
    out.set(new Date(p.time * 1000).toISOString().slice(0, 7), p.close);
  }
  return out;
}

/** 在 macroMonths 的时间轴上，找该资产从第一个可用月起、无缺口的连续区间 */
function alignToMacroMonths(macroMonths: string[], levels: Map<string, number>): string[] {
  const startIdx = macroMonths.findIndex((m) => levels.has(m));
  if (startIdx < 0) return [];
  const out: string[] = [];
  for (let i = startIdx; i < macroMonths.length; i += 1) {
    if (!levels.has(macroMonths[i]!)) break;
    out.push(macroMonths[i]!);
  }
  return out;
}

/**
 * 领先-滞后扫描（Cross-Correlation）：k>0 表示「资产收益领先，k 个月后因子才变动」，
 * k<0 表示「因子先变，资产收益随后跟上」，k=0 是同期共动。
 * 对每个资产、每个因子（growthZ / inflationZ）各扫 -6..+6，共 10×2×13=260 个格子，
 * 按全表做 BH-FDR，不按资产或因子分别校正——否则等于多做了 20 次「独立」多重检验。
 */
async function ccfPanel(
  assets: Array<{ id: string; nameZh: string; symbol: string }>,
  closes: Record<string, ClosePoint[]>,
  macro: MacroRow[],
) {
  console.log(
    "\n## 领先-滞后扫描（CCF）：资产收益 vs 因子变动，循环移位置换\n" +
      "   k>0 = 资产收益领先 k 个月；k<0 = 因子变动领先 k 个月；k=0 = 同期。",
  );
  const macroByMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const macroMonths = [...macroByMonth.keys()].sort();
  const lags = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

  type Cell = { asset: string; factor: string; lag: number; r: number; p: number };
  const cells: Cell[] = [];
  const tables: Record<string, Array<Record<string, string | number>>> = { growthZ: [], inflZ: [] };

  for (const asset of assets) {
    const months = alignToMacroMonths(macroMonths, monthEndLevels(closes[asset.symbol]));
    if (months.length < 80) continue;
    const levels = monthEndLevels(closes[asset.symbol]);
    const levelArr = months.map((m) => levels.get(m)!);
    const retArr = levelArr.slice(1).map((v, i) => v / levelArr[i]! - 1);
    // retArr[t] 对应 months[t+1] 当月收益

    for (const factorKey of ["growthZ", "inflZ"] as const) {
      const zArr = months.map((m) => macroByMonth.get(m)![factorKey]!);
      const row: Record<string, string | number> = { 资产: asset.nameZh, n: retArr.length };
      for (const lag of lags) {
        const pairsX: number[] = [];
        const pairsY: number[] = [];
        for (let t = 0; t < retArr.length; t += 1) {
          const idx = t + 1 + lag;
          if (idx <= 0 || idx >= zArr.length) continue;
          pairsX.push(retArr[t]!);
          pairsY.push(zArr[idx]! - zArr[idx - 1]!);
        }
        if (pairsX.length < 60) {
          row[`k=${lag}`] = "—";
          continue;
        }
        const r = pearsonCorr(pairsX, pairsY);
        const p = circularShiftP(pairsX, pairsY, r);
        cells.push({ asset: asset.nameZh, factor: factorKey, lag, r, p });
        row[`k=${lag}`] = `${r >= 0 ? "+" : ""}${r.toFixed(2)}`;
      }
      tables[factorKey]!.push(row);
    }
  }

  for (const [factorKey, label] of [
    ["growthZ", "增长因子 z"],
    ["inflZ", "通胀因子 z"],
  ] as const) {
    console.log(`\n### vs ${label}（相关系数 r，未标注显著性——见下方 FDR 幸存清单）`);
    console.table(tables[factorKey]);
  }

  const pass = benjaminiHochberg(
    cells.map((c) => c.p),
    0.1,
  );
  const survivors = cells.filter((_, i) => pass[i]).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  console.log(
    `\n全表 ${cells.length} 个格子，BH-FDR(q=0.10) 通过 ${survivors.length} 个：` +
      (survivors.length
        ? `\n  ${survivors
            .map((s) => `${s.asset}·${s.factor}·k=${s.lag} r=${s.r.toFixed(2)} p=${s.p.toFixed(3)}`)
            .join("\n  ")}`
        : "（无）"),
  );
}

/**
 * 黄金的具体假说：增长下 + 通胀下（dalioRegime 的 deflation 象限，DALIO_LABEL_ZH 已核对
 * 定义为「增↓通↓」）应该是黄金表现最强的象限。照实报告四个象限的排序，不预设哪个赢。
 */
async function goldQuadrantHypothesis(closes: Record<string, ClosePoint[]>, macro: MacroRow[]) {
  console.log("\n## 黄金假说检验：deflation（增↓通↓）是否是黄金表现最强的象限？");
  const byMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const months = [...byMonth.keys()].sort();
  const levels = monthEndLevels(closes.GOLD_LONDON);
  const cells: Array<{ y: number; quadrant: string }> = [];
  for (let i = 1; i < months.length; i += 1) {
    const now = levels.get(months[i]!);
    const before = levels.get(months[i - 1]!);
    const quadrant = byMonth.get(months[i]!)?.dalio;
    if (now == null || before == null || !before || !quadrant) continue;
    cells.push({ y: now / before - 1, quadrant });
  }
  const winsorized = winsorize(cells.map((c) => c.y));
  cells.forEach((c, i) => {
    c.y = winsorized[i]!;
  });
  const quadrants = [...new Set(cells.map((c) => c.quadrant))];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const ranking = quadrants
    .map((q) => ({ q, mean: mean(cells.filter((c) => c.quadrant === q).map((c) => c.y)), n: cells.filter((c) => c.quadrant === q).length }))
    .sort((a, b) => b.mean - a.mean);
  console.log(
    ranking
      .map((r, i) => `#${i + 1} ${DALIO_LABEL_ZH_LOCAL[r.q] ?? r.q}：${(r.mean * 100).toFixed(2)}%/月 (n=${r.n})`)
      .join("\n"),
  );

  const deflationRank = ranking.findIndex((r) => r.q === "deflation") + 1;
  const top = ranking[0]!;
  if (top.q === "deflation") {
    console.log("→ 假说成立方向：deflation 确实是均值最高的象限。");
  } else {
    console.log(
      `→ 假说与数据不符：deflation 排第 ${deflationRank}/${ranking.length} 位（${(ranking.find((r) => r.q === "deflation")?.mean ?? NaN) * 100}%/月），` +
        `均值最高的是「${DALIO_LABEL_ZH_LOCAL[top.q] ?? top.q}」（${(top.mean * 100).toFixed(2)}%/月）。`,
    );
  }

  // 分块置换：deflation 均值 是否显著高于其余三象限合并均值（单尾）
  const labels = cells.map((c) => c.quadrant);
  const observed =
    mean(cells.filter((c) => c.quadrant === "deflation").map((c) => c.y)) -
    mean(cells.filter((c) => c.quadrant !== "deflation").map((c) => c.y));
  const blockLen = 12;
  const blocks = Math.ceil(cells.length / blockLen);
  let ge = 0;
  for (let iter = 0; iter < PERM; iter += 1) {
    const shuffled: string[] = [];
    for (let b = 0; b < blocks; b += 1) {
      const start = Math.floor(rand() * cells.length);
      for (let k = 0; k < blockLen && shuffled.length < cells.length; k += 1) {
        shuffled.push(labels[(start + k) % cells.length]!);
      }
    }
    const diff =
      mean(cells.filter((_, i) => shuffled[i] === "deflation").map((c) => c.y)) -
      mean(cells.filter((_, i) => shuffled[i] !== "deflation").map((c) => c.y));
    if (diff >= observed) ge += 1;
  }
  console.log(
    `deflation vs 其余三象限合并，观测差 ${(observed * 100).toFixed(2)}%/月，单尾分块置换 p=${((ge + 1) / (PERM + 1)).toFixed(3)}`,
  );
}

const DALIO_LABEL_ZH_LOCAL: Record<string, string> = {
  reflation: "再通胀(增↑通↑)",
  goldilocks: "金发女孩(增↑通↓)",
  stagflation: "真滞胀(增↓通↑)",
  deflation: "通缩衰退(增↓通↓)",
};

/**
 * 衰退里「股票快跌 + 短端利率快跌」是否同步发生：用 NBER USREC 真值分组，
 * 比较衰退月与非衰退月里，「股票单月跌 且 短端收益率单月降」同时出现的比例。
 * 短端利率用 ^IRX（13 周国库券收益率，水平值，不是资产收益）月度变化（百分点）。
 */
async function recessionCoMovePanel(closes: Record<string, ClosePoint[]>, macro: MacroRow[]) {
  console.log("\n## 衰退期股票与短端利率是否同步快速下行？");
  const byMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const months = [...byMonth.keys()].sort();
  const stockLevels = monthEndLevels(closes.VFINX);
  const irxLevels = monthEndLevels(closes["^IRX"]);

  type Row = { month: string; stockRet: number; irxChange: number; recession: number };
  const rows: Row[] = [];
  for (let i = 1; i < months.length; i += 1) {
    const s1 = stockLevels.get(months[i]!);
    const s0 = stockLevels.get(months[i - 1]!);
    const y1 = irxLevels.get(months[i]!);
    const y0 = irxLevels.get(months[i - 1]!);
    const recession = byMonth.get(months[i]!)?.recession;
    if (s1 == null || !s0 || y1 == null || y0 == null || recession == null) continue;
    rows.push({ month: months[i]!, stockRet: s1 / s0 - 1, irxChange: y1 - y0, recession });
  }
  console.log(`可比样本 ${rows.length} 个月（含 ${rows.filter((r) => r.recession === 1).length} 个 NBER 衰退月）`);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  for (const flag of [1, 0] as const) {
    const subset = rows.filter((r) => r.recession === flag);
    console.log(
      `${flag ? "衰退月" : "非衰退月"}（n=${subset.length}）：股票均值 ${(mean(subset.map((r) => r.stockRet)) * 100).toFixed(2)}%/月，` +
        `短端收益率均值变化 ${mean(subset.map((r) => r.irxChange)).toFixed(2)}pp/月，` +
        `两者相关 r=${pearsonCorr(subset.map((r) => r.stockRet), subset.map((r) => r.irxChange)).toFixed(2)}`,
    );
  }

  // 「同步」定义：当月股票下跌 且 短端收益率同时下降，两者都发生才算一次同步下行
  const coDown = (r: Row) => r.stockRet < 0 && r.irxChange < 0;
  const observedGap =
    rows.filter((r) => r.recession === 1 && coDown(r)).length / Math.max(1, rows.filter((r) => r.recession === 1).length) -
    rows.filter((r) => r.recession === 0 && coDown(r)).length / Math.max(1, rows.filter((r) => r.recession === 0).length);
  const recFlags = rows.map((r) => r.recession);
  const blockLen = 12;
  const blocks = Math.ceil(rows.length / blockLen);
  let ge = 0;
  for (let iter = 0; iter < PERM; iter += 1) {
    const shuffled: number[] = [];
    for (let b = 0; b < blocks; b += 1) {
      const start = Math.floor(rand() * rows.length);
      for (let k = 0; k < blockLen && shuffled.length < rows.length; k += 1) {
        shuffled.push(recFlags[(start + k) % rows.length]!);
      }
    }
    const p1 = rows.filter((r, i) => shuffled[i] === 1 && coDown(r)).length / Math.max(1, shuffled.filter((v) => v === 1).length);
    const p0 = rows.filter((r, i) => shuffled[i] === 0 && coDown(r)).length / Math.max(1, shuffled.filter((v) => v === 0).length);
    if (p1 - p0 >= observedGap) ge += 1;
  }
  console.log(
    `「股票跌+短端利率同时降」的月度占比：衰退月 ${(rows.filter((r) => r.recession === 1 && coDown(r)).length / Math.max(1, rows.filter((r) => r.recession === 1).length) * 100).toFixed(0)}% vs ` +
      `非衰退月 ${(rows.filter((r) => r.recession === 0 && coDown(r)).length / Math.max(1, rows.filter((r) => r.recession === 0).length) * 100).toFixed(0)}%，` +
      `单尾分块置换 p=${((ge + 1) / (PERM + 1)).toFixed(3)}`,
  );
}

/**
 * 用户明确要求的方法：把多个资产的**趋势拐点叠加**成一个扩散指数，测它是否领先于
 * regime 确认转折（而不是像前面那样直接测资产收益本身）。
 *
 * 扩散指数的三个分量都是独立成立的「风险收紧」信号，不是搜出来的组合（避免 P2 备忘录
 * 强调的「拿收益反选组合」过拟合）：
 *   - 股票滚动 3 月趋势转跌
 *   - 高收益债相对长期美债的滚动 3 月超额转负（信用利差走阔的资产端代理）
 *   - 长期美债滚动 3 月趋势转强（长端利率下行、避险买盘，早周期典型反应）
 * 三者都指向「转弱」时 diffusion=1；都不指向时 diffusion=0。
 *
 * 事件研究：对齐每一次「确认的」增长方向转跌（原始转折需连续保持 ≥3 个月才算确认，
 * 与 dalioRegime 的 minPhaseMonths 口径一致），看确认转折前后 diffusion 的均值路径，
 * 并用置换（随机抽取等量伪事件日期）检验「转折前窗口 diffusion 均值」是否显著高于随机。
 */
async function diffusionEventStudy(closes: Record<string, ClosePoint[]>, macro: MacroRow[]) {
  console.log(
    "\n## 拐点叠加：风险收紧扩散指数是否领先于 regime 确认转折\n" +
      "   分量：股票趋势转跌 + 高收益债相对长债超额转负 + 长期美债趋势转强（每个都是独立成立的风险信号）",
  );
  const byMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const macroMonths = [...byMonth.keys()].sort();

  const spyMonths = alignToMacroMonths(macroMonths, monthEndLevels(closes.VFINX));
  const hyMonths = alignToMacroMonths(macroMonths, monthEndLevels(closes.VWEHX));
  const ustMonths = alignToMacroMonths(macroMonths, monthEndLevels(closes.VUSTX));
  const common = macroMonths.filter((m) => spyMonths.includes(m) && hyMonths.includes(m) && ustMonths.includes(m));
  if (common.length < 120) {
    console.log("可用共同历史不足，跳过扩散指数分析。");
    return;
  }

  const spyLevels = monthEndLevels(closes.VFINX);
  const hyLevels = monthEndLevels(closes.VWEHX);
  const ustLevels = monthEndLevels(closes.VUSTX);
  const ret = (levels: Map<string, number>, month: string, prevMonth: string) => {
    const a = levels.get(prevMonth);
    const b = levels.get(month);
    return a && b ? b / a - 1 : null;
  };

  const spyRet: (number | null)[] = [null];
  const hyExcessRet: (number | null)[] = [null];
  const ustRet: (number | null)[] = [null];
  for (let i = 1; i < common.length; i += 1) {
    const spy = ret(spyLevels, common[i]!, common[i - 1]!);
    const hy = ret(hyLevels, common[i]!, common[i - 1]!);
    const ust = ret(ustLevels, common[i]!, common[i - 1]!);
    spyRet.push(spy);
    hyExcessRet.push(hy != null && ust != null ? hy - ust : null);
    ustRet.push(ust);
  }
  const trailing3 = (arr: (number | null)[], i: number) => {
    if (i < 3) return null;
    const window = [arr[i]!, arr[i - 1]!, arr[i - 2]!];
    return window.every((v) => v != null) ? window.reduce((a, b) => a! + b!, 0) : null;
  };

  const diffusion: (number | null)[] = common.map((_, i) => {
    const spy3 = trailing3(spyRet, i);
    const hy3 = trailing3(hyExcessRet, i);
    const ust3 = trailing3(ustRet, i);
    if (spy3 == null || hy3 == null || ust3 == null) return null;
    const signals = [spy3 < 0, hy3 < 0, ust3 > 0];
    return signals.filter(Boolean).length / signals.length;
  });

  // 确认的增长方向转跌：原始转折后连续保持 falling ≥3 期
  const rawDir = common.map((m) => byMonth.get(m)?.growthDirection ?? null);
  const confirmedFlips: number[] = [];
  for (let i = 1; i < rawDir.length - 2; i += 1) {
    const prev = rawDir[i - 1];
    const cur = rawDir[i];
    if (prev === "rising" && cur === "falling" && rawDir[i + 1] === "falling" && rawDir[i + 2] === "falling") {
      confirmedFlips.push(i);
    }
  }
  console.log(`确认的增长转跌事件（原始转折后连续保持 falling ≥3 期）：${confirmedFlips.length} 次`);

  const window = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3];
  const profile = window.map((offset) => {
    const values = confirmedFlips
      .map((i) => diffusion[i + offset])
      .filter((v): v is number => v != null);
    return { offset, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN, n: values.length };
  });
  console.log("\n事件对齐后 diffusion 均值路径（0 = 确认转跌那个月）：");
  console.log(profile.map((p) => `t${p.offset >= 0 ? "+" : ""}${p.offset}=${Number.isFinite(p.mean) ? p.mean.toFixed(2) : "—"}(n${p.n})`).join("  "));

  const validDiffusion = diffusion.filter((v): v is number => v != null);
  const overallMean = validDiffusion.reduce((a, b) => a + b, 0) / validDiffusion.length;
  const preWindowMean = (idx: number[]) => {
    const values = idx
      .flatMap((i) => [-3, -2, -1].map((o) => diffusion[i + o]))
      .filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  };
  const observedPre = preWindowMean(confirmedFlips);
  console.log(
    `转跌确认前 3 个月（t-3..t-1）diffusion 均值 = ${observedPre.toFixed(2)}，同期全样本均值 = ${overallMean.toFixed(2)}`,
  );

  // 置换：在可用范围内随机抽取等量伪事件日期，比较 pre-window 均值
  const validRange = confirmedFlips.length
    ? [3, diffusion.length - 4]
    : [3, diffusion.length - 4];
  let ge = 0;
  for (let iter = 0; iter < PERM; iter += 1) {
    const pseudo: number[] = [];
    for (let k = 0; k < confirmedFlips.length; k += 1) {
      pseudo.push(validRange[0]! + Math.floor(rand() * (validRange[1]! - validRange[0]! + 1)));
    }
    if (preWindowMean(pseudo) >= observedPre) ge += 1;
  }
  console.log(
    `随机抽取等量伪事件日期，pre-window diffusion 均值 ≥ 观测值的比例（单尾 p）= ${((ge + 1) / (PERM + 1)).toFixed(3)}`,
  );
}

/**
 * regime 象限 × 资产的月均收益，配分块置换检验。
 * 象限标签本身高度持续（平均一段 6–7 个月），所以「组间差异」的零分布必须用分块置换生成，
 * i.i.d. 打乱会把一段连续行情当成几十个独立观测。
 */
async function quadrantPanel(
  assets: Array<{ id: string; nameZh: string; symbol: string }>,
  closes: Record<string, ClosePoint[]>,
  macro: MacroRow[],
) {
  for (const key of ["regime", "dalio"] as const) {
    const label = key === "regime" ? "regime（增长水平 × 通胀动量）" : "dalioRegime（增长方向 × 通胀方向）";
    console.log(`\n## 象限均值表：${label}   单位 %/月`);
    const byMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
    const months = [...byMonth.keys()].sort();
    const buckets = [...new Set(macro.map((m) => m[key]).filter((v): v is string => !!v))].sort();
    const table: Array<Record<string, string | number>> = [];
    const pList: Array<{ asset: string; p: number }> = [];

    for (const asset of assets) {
      const ends = new Map<string, number>();
      for (const point of closes[asset.symbol] ?? []) {
        const monthKey = new Date(point.time * 1000).toISOString().slice(0, 7);
        const prevPoint = ends.get(monthKey);
        if (prevPoint == null) ends.set(monthKey, point.close);
        else ends.set(monthKey, point.close);
      }
      const cells: Array<{ y: number; bucket: string }> = [];
      for (let i = 1; i < months.length; i += 1) {
        const now = ends.get(months[i]!);
        const before = ends.get(months[i - 1]!);
        const bucket = byMonth.get(months[i]!)?.[key];
        if (now == null || before == null || !before || !bucket) continue;
        cells.push({ y: now / before - 1, bucket });
      }
      if (cells.length < 120) {
        table.push({ 资产: asset.nameZh, n: cells.length, 说明: "样本不足" });
        continue;
      }
      // 与回归口径一致：极端月同样缩尾，否则象限均值会被 2008/2020 的个位数月份主导
      const winsorized = winsorize(cells.map((c) => c.y));
      cells.forEach((c, i) => {
        c.y = winsorized[i]!;
      });
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
      const groupMean = (bucket: string) => mean(cells.filter((c) => c.bucket === bucket).map((c) => c.y));
      const spread = () => {
        const values = buckets.map(groupMean).filter((v) => Number.isFinite(v));
        return Math.max(...values) - Math.min(...values);
      };
      const observedSpread = spread();

      // 分块置换：整块搬移象限标签，保留其持续性
      const labels = cells.map((c) => c.bucket);
      const blockLen = 12;
      const blocks = Math.ceil(cells.length / blockLen);
      let ge = 0;
      for (let iter = 0; iter < PERM; iter += 1) {
        const shuffled: string[] = [];
        for (let b = 0; b < blocks; b += 1) {
          const start = Math.floor(rand() * cells.length);
          for (let k = 0; k < blockLen && shuffled.length < cells.length; k += 1) {
            shuffled.push(labels[(start + k) % cells.length]!);
          }
        }
        const means = buckets
          .map((bucket) => mean(cells.filter((_, i) => shuffled[i] === bucket).map((c) => c.y)))
          .filter((v) => Number.isFinite(v));
        if (means.length < 2) continue;
        if (Math.max(...means) - Math.min(...means) >= observedSpread) ge += 1;
      }
      const pValue = (ge + 1) / (PERM + 1);
      pList.push({ asset: asset.nameZh, p: pValue });

      const row: Record<string, string | number> = { 资产: asset.nameZh, n: cells.length };
      for (const bucket of buckets) {
        const count = cells.filter((c) => c.bucket === bucket).length;
        row[bucket] = `${(groupMean(bucket) * 100).toFixed(2)} (${count})`;
      }
      row["极差"] = Number((observedSpread * 100).toFixed(2));
      row["p_block"] = Number(pValue.toFixed(3));
      table.push(row);
    }
    console.table(table);
    // 有效独立观测 ≈ 象限连续段数，而不是月数：这是长样本仍然测不动的根本原因
    const labelSeq = months.map((m) => byMonth.get(m)?.[key] ?? null);
    let episodes = 0;
    for (let i = 0; i < labelSeq.length; i += 1) {
      if (labelSeq[i] && labelSeq[i] !== labelSeq[i - 1]) episodes += 1;
    }
    console.log(
      `样本跨度 ${months.length} 个月，但象限只切换出 ${episodes} 段连续区间` +
        `（平均 ${(months.length / Math.max(1, episodes)).toFixed(1)} 个月一段）——有效独立观测按段算，不按月算。`,
    );
    const pass = benjaminiHochberg(pList.map((x) => x.p), 0.1);
    const survivors = pList.filter((_, i) => pass[i]);
    console.log(
      `象限组间差异：${pList.length} 个资产，BH-FDR(q=0.10) 通过 ${survivors.length} 个` +
        (survivors.length ? `：${survivors.map((x) => `${x.asset} p=${x.p.toFixed(3)}`).join("、")}` : ""),
    );
  }
}

// ───────────────────────────────────────────── 月度口径复核

/**
 * 阶段口径只有 29 个观测，任何 3 个自变量的模型都在功效边缘：即使真效应存在，
 * 也可能一个都测不出来。同一批假设在月度口径（n≈310）重测一次，才能把
 * 「没有效应」和「没有功效」分开。阶段口径仍是展示层，月度口径是判据层。
 */
async function monthlyPanel(
  assets: Array<{ id: string; nameZh: string; symbol: string }>,
  closes: Record<string, ClosePoint[]>,
  macro: MacroRow[],
) {
  /** 每月最后一个交易日收盘 */
  function monthEnds(points: readonly ClosePoint[] | undefined) {
    const byMonth = new Map<string, ClosePoint>();
    for (const p of points ?? []) {
      const key = new Date(p.time * 1000).toISOString().slice(0, 7);
      const prev = byMonth.get(key);
      if (!prev || p.time > prev.time) byMonth.set(key, p);
    }
    return byMonth;
  }

  const macroByMonth = new Map(macro.map((m) => [m.date.slice(0, 7), m]));
  const months = [...macroByMonth.keys()].sort();

  console.log(`\n# 月度口径复核（${months[0]} → ${months.at(-1)}，n≈${months.length}）`);
  console.log(
    "同期模型 y_t ~ ΔgrowthZ_t + ΔinflZ_t 用 i.i.d. 置换（差分项无持续性）；" +
      "前瞻模型 y_t ~ growthZ_{t-1} + inflZ_{t-1} + 回撤_{t-1} 用 12 月分块置换（水平项高度持续）。",
  );

  type MonthlyResult = { asset: string; model: string; term: string; beta: number; p: number };
  const monthlyResults: MonthlyResult[] = [];

  if (WINSOR > 0) console.log(`（月度收益已按 ${(WINSOR * 100).toFixed(0)}% 双侧缩尾）`);

  const monthlyModels = [
    { id: "M1", label: "同期：Δz 解释当月收益", terms: ["dGrowthZ", "dInflZ"], block: 1 },
    { id: "M2", label: "前瞻：上月 z 水平 + 上月超跌预测当月收益", terms: ["growthZ_1", "inflZ_1", "drawdown_1"], block: 12 },
    { id: "M3", label: "探索：超跌 × 增长顺风 交互", terms: ["drawdown_1", "dGrowthZ", "drawdown_1:dGrowthZ"], block: 12 },
  ];

  for (const model of monthlyModels) {
    console.log(`\n## ${model.id}：${model.label}   y = 当月收益(%)`);
    const table: Array<Record<string, string | number>> = [];
    for (const asset of assets) {
      const ends = monthEnds(closes[asset.symbol]);
      const sample: Array<Record<string, number>> = [];
      for (let i = 2; i < months.length; i += 1) {
        const month = months[i]!;
        const prev = months[i - 1]!;
        const prev2 = months[i - 2]!;
        const close = ends.get(month);
        const closePrev = ends.get(prev);
        if (!close || !closePrev || !closePrev.close) continue;
        const macroNow = macroByMonth.get(month);
        const macroPrev = macroByMonth.get(prev);
        const macroPrev2 = macroByMonth.get(prev2);
        if (macroNow?.growthZ == null || macroPrev?.growthZ == null || macroPrev2?.growthZ == null) continue;
        if (macroNow.inflZ == null || macroPrev.inflZ == null) continue;

        // 期初回撤：只用 t-1 及更早的月末价，天然无前视
        let peak = 0;
        let seen = 0;
        for (let k = i - 1; k >= 0 && seen < 36; k -= 1) {
          const past = ends.get(months[k]!);
          if (!past) continue;
          seen += 1;
          if (past.close > peak) peak = past.close;
        }
        if (seen < 24 || peak <= 0) continue;

        sample.push({
          y: close.close / closePrev.close - 1,
          dGrowthZ: macroNow.growthZ - macroPrev.growthZ,
          dInflZ: macroNow.inflZ - macroPrev.inflZ,
          growthZ_1: macroPrev.growthZ,
          inflZ_1: macroPrev.inflZ,
          drawdown_1: closePrev.close / peak - 1,
        });
      }
      if (sample.length < 60) {
        table.push({ 资产: asset.nameZh, n: sample.length, 说明: "样本不足" });
        continue;
      }
      const columns = model.terms.map((term) => {
        const parts = term.split(":");
        return standardize(sample.map((r) => parts.reduce((v, part) => v * r[part]!, 1)));
      });
      const X = sample.map((_, i) => [1, ...columns.map((column) => column[i]!)]);
      const y = winsorize(sample.map((r) => r.y!));
      const w = sample.map(() => 1);
      const fit = wls(X, y, w);
      if (!fit) {
        table.push({ 资产: asset.nameZh, n: sample.length, 说明: "共线" });
        continue;
      }
      const row: Record<string, string | number> = {
        资产: asset.nameZh,
        n: fit.n,
        "R²adj": Number(fit.r2adj.toFixed(3)),
      };
      model.terms.forEach((term, k) => {
        const j = k + 1;
        const p =
          model.block > 1
            ? blockPermutationP(X, y, w, j, fit.t[j]!, model.block)
            : freedmanLaneP(X, y, w, j, fit.t[j]!);
        const beta = fit.beta[j]! * 100;
        row[term] = `${beta >= 0 ? "+" : ""}${beta.toFixed(2)} (p=${p.toFixed(3)})`;
        monthlyResults.push({ asset: asset.nameZh, model: model.id, term, beta, p });
      });
      table.push(row);
    }
    console.table(table);
  }

  console.log(
    "\n## 2×2 诊断：把「超跌 × 顺风」写成可直接读的均值表（%/月）\n" +
      "   深跌 = 上月回撤低于该资产中位数；顺风 = 当月 growthZ 环比上升。" +
      "用户假说成立的话，`深跌·顺风` 应显著高于 `浅跌·顺风`。",
  );
  const diag: Array<Record<string, string | number>> = [];
  const diagP: Array<{ asset: string; p: number }> = [];
  for (const asset of assets) {
    const ends = monthEnds(closes[asset.symbol]);
    const raw: Array<{ y: number; drawdown: number; tail: boolean }> = [];
    const cells: Array<{ y: number; deep: boolean; tail: boolean }> = [];
    for (let i = 2; i < months.length; i += 1) {
      const month = months[i]!;
      const prev = months[i - 1]!;
      const close = ends.get(month);
      const closePrev = ends.get(prev);
      const macroNow = macroByMonth.get(month);
      const macroPrev = macroByMonth.get(prev);
      if (!close || !closePrev?.close || macroNow?.growthZ == null || macroPrev?.growthZ == null) continue;
      let peak = 0;
      let seen = 0;
      for (let k = i - 1; k >= 0 && seen < 36; k -= 1) {
        const past = ends.get(months[k]!);
        if (!past) continue;
        seen += 1;
        if (past.close > peak) peak = past.close;
      }
      if (seen < 24 || peak <= 0) continue;
      raw.push({
        y: close.close / closePrev.close - 1,
        drawdown: closePrev.close / peak - 1,
        tail: macroNow.growthZ - macroPrev.growthZ > 0,
      });
    }
    if (raw.length < 60) continue;
    // 「深跌」按该资产自身回撤分布切一半，用**秩**而不是数值阈值：
    // 高收益债这类长期贴着新高的资产回撤中位数就是 0，用 `<= 中位数` 会把全部月份判成深跌。
    const rank = raw.map((_, i) => i).sort((a, b) => raw[a]!.drawdown - raw[b]!.drawdown);
    const deepSet = new Set(rank.slice(0, Math.floor(rank.length / 2)));
    raw.forEach((r, i) => cells.push({ y: r.y, deep: deepSet.has(i), tail: r.tail }));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);
    const pick = (deep: boolean, tail: boolean) =>
      winsorize(cells.filter((c) => c.deep === deep && c.tail === tail).map((c) => c.y));
    const dt = pick(true, true);
    const df = pick(true, false);
    const st = pick(false, true);
    const sf = pick(false, false);
    // 「深−浅」的显著性：回撤状态高度持续（连着好几个月都在深跌里），i.i.d. 打乱
    // 会把一段连续行情当成几十个独立观测。按 12 个月整块循环搬移 deep 标签。
    const observed = mean(dt) - mean(st);
    const deepFlags = cells.map((c) => c.deep);
    const blockLen = 12;
    const blocks = Math.ceil(cells.length / blockLen);
    let ge = 0;
    for (let iter = 0; iter < PERM; iter += 1) {
      const shuffled: boolean[] = [];
      for (let b = 0; b < blocks; b += 1) {
        const start = Math.floor(rand() * cells.length);
        for (let k = 0; k < blockLen && shuffled.length < cells.length; k += 1) {
          shuffled.push(deepFlags[(start + k) % cells.length]!);
        }
      }
      const dtStar = winsorize(cells.filter((c, i) => shuffled[i] && c.tail).map((c) => c.y));
      const stStar = winsorize(cells.filter((c, i) => !shuffled[i] && c.tail).map((c) => c.y));
      if (dtStar.length < 5 || stStar.length < 5) continue;
      if (Math.abs(mean(dtStar) - mean(stStar)) >= Math.abs(observed)) ge += 1;
    }
    const diffP = (ge + 1) / (PERM + 1);
    diagP.push({ asset: asset.nameZh, p: diffP });
    diag.push({
      资产: asset.nameZh,
      "深跌·顺风": `${(mean(dt) * 100).toFixed(2)} (${dt.length})`,
      "深跌·逆风": `${(mean(df) * 100).toFixed(2)} (${df.length})`,
      "浅跌·顺风": `${(mean(st) * 100).toFixed(2)} (${st.length})`,
      "浅跌·逆风": `${(mean(sf) * 100).toFixed(2)} (${sf.length})`,
      "深−浅(顺风时)": Number((observed * 100).toFixed(2)),
      p_block: Number(diffP.toFixed(3)),
    });
  }
  console.table(diag);
  const diagPass = benjaminiHochberg(diagP.map((d) => d.p), 0.1);
  const diagSurvivors = diagP.filter((_, i) => diagPass[i]);
  console.log(
    `「深−浅(顺风时)」差值的分块置换检验：${diagP.length} 个资产，BH-FDR(q=0.10) 通过 ${diagSurvivors.length} 个` +
      (diagSurvivors.length ? `：${diagSurvivors.map((d) => `${d.asset} p=${d.p.toFixed(3)}`).join("、")}` : ""),
  );

  console.log("\n## 月度口径多重检验：按模型族 BH-FDR (q=0.10)");
  for (const family of [...new Set(monthlyResults.map((r) => r.model))]) {
    const subset = monthlyResults.filter((r) => r.model === family);
    const pass = benjaminiHochberg(subset.map((r) => r.p), 0.1);
    const survivors = subset.filter((_, i) => pass[i]);
    console.log(
      `${family}：${subset.length} 个系数检验，通过 ${survivors.length} 个` +
        (survivors.length
          ? `\n  ${survivors
              .map((s) => `${s.asset}·${s.term} β=${s.beta >= 0 ? "+" : ""}${s.beta.toFixed(2)}% p=${s.p.toFixed(3)}`)
              .join("\n  ")}`
          : ""),
    );
  }
}

(LEADLAG_RUN ? leadLagRun() : LONG_RUN ? longRun() : main())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

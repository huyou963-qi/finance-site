/**
 * 美国 GDP nowcast 服务：装载版本账本 → 按「今天在目标季度的第几天」同口径回测 →
 * 当前 nowcast、80% 区间、季内精度曲线、亚特兰大联储 GDPNow 对照。模型输出不入库，进程内缓存 30 分钟。
 *
 * 载荷分两层：公开部分（预测值、区间、回测精度）所有可访问该页的用户都能看到；`model`
 * （方程、输入、权重、系数、数据时效）属于核心算法，只给管理员——页面与 API 对非管理员调用
 * `toPublicUsGdpPayload` 剥离后再下发。
 */
import { GDPNOW_PAGE_URL, loadGdpNow } from "./gdpNow";
import { GDP_EQUATION_LABELS, GDP_INDICATORS, GDP_MODEL_CONFIG } from "./indicators";
import { loadUsGdpNowcastInputs, type GdpFreshness, type LoadedGdpInputs } from "./inputs";
import {
  addDays,
  addQuarters,
  asOfOffset,
  asOfPreRelease,
  buildDataset,
  datasetRow,
  errorBand,
  errorStats,
  gdpFirstRelease,
  gdpGrowthAsOf,
  isCovidQuarter,
  minIso,
  nowcastLive,
  quarterLabel,
  runBacktest,
  valueAsOf,
  type AsOfRule,
  type BacktestPoint,
  type ErrorStats,
  type IndicatorTransform,
  type RevisionLedger,
} from "./model";

export type { ErrorStats };

/** 训练从 1993 年起（ALFRED GDPC1 首个版本 1991-12），回测与图表从 2000 年起 */
const DATASET_FROM = "1993-01-01";
const BACKTEST_FROM = "2000-01-01";
const TEST_FROM = "2012-01-01";
const GDPNOW_FROM = "2016-04-01";
const CACHE_TTL_MS = 30 * 60_000;
const CURVE_TTL_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

const SPECS = GDP_INDICATORS.map((d) => ({ key: d.key, transform: d.transform }));

type CurveKey = "d35" | "d60" | "d91" | "d105" | "pre";
const CURVE: Array<{ key: CurveKey; label: string; rule: AsOfRule }> = [
  { key: "d35", label: "季度第 35 天（上季首发后）", rule: asOfOffset(34) },
  { key: "d60", label: "季度第 60 天", rule: asOfOffset(59) },
  { key: "d91", label: "季度结束", rule: asOfOffset(90) },
  { key: "d105", label: "季后第 15 天", rule: asOfOffset(104) },
  { key: "pre", label: "GDP 首发前一天", rule: asOfPreRelease },
];

export type GdpAccuracy = { model: ErrorStats; mean40: ErrorStats; prevQ: ErrorStats; gdpNow?: ErrorStats };

export type GdpCurveRow = {
  key: string;
  label: string;
  mae: number;
  rmse: number;
  n: number;
  bandHalfWidth: number;
  /** 2016Q2 起、GDPNow 同一时点有值的季度上：本模型与 GDPNow 的 MAE */
  sameSampleModelMae: number | null;
  gdpNowMae: number | null;
  gdpNowN: number;
  current: boolean;
};

export type UsGdpNowcastPublicPayload = {
  generatedAt: string;
  targetQuarter: string;
  latestQuarter: string;
  asOf: string;
  /** 今天距目标季度首日的天数（历史回测按同一偏移取数） */
  offsetDays: number;
  /** 实际 GDP 季度环比折年率 % */
  nowcast: number;
  low: number;
  high: number;
  gdpNow: { value: number; sourceUrl: string } | null;
  recent: Array<{ quarter: string; first: number; latest: number }>;
  curve: GdpCurveRow[];
  accuracy: {
    /** 当前时点、2012 年以来（剔除疫情段）：本模型与简单基准 */
    test: GdpAccuracy;
    /** 2016Q2 起同一样本：当前时点 / 首发前一天，本模型与 GDPNow */
    vsGdpNowNow: GdpAccuracy | null;
    vsGdpNowPre: GdpAccuracy | null;
    testFrom: string;
    gdpNowFrom: string;
  };
  backtest: Array<{ quarter: string; forecast: number; actual: number; gdpNow: number | null; covid: boolean }>;
};

export type UsGdpModelDetails = {
  window: number;
  weightWindow: number;
  equations: Array<{
    key: string;
    label: string;
    inputs: string[];
    forecast: number;
    weight: number;
    intercept: number;
    coef: Record<string, number>;
    n: number;
  }>;
  indicators: Array<{
    key: string;
    label: string;
    seriesKey: string;
    transform: IndicatorTransform;
    value: number | null;
    observed: number | null;
  }>;
  freshness: GdpFreshness[];
};

export type UsGdpNowcastPayload = UsGdpNowcastPublicPayload & { model: UsGdpModelDetails };

/** 非管理员看到的载荷：去掉核心算法 */
export function toPublicUsGdpPayload(payload: UsGdpNowcastPayload): UsGdpNowcastPublicPayload {
  const { model: _model, ...rest } = payload;
  return rest;
}

let cache: { at: number; payload: UsGdpNowcastPayload } | null = null;
const curveCache = new Map<string, { at: number; points: BacktestPoint[] }>();

export async function getUsGdpNowcast(opts?: { force?: boolean }): Promise<UsGdpNowcastPayload> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = await computeUsGdpNowcast();
  cache = { at: Date.now(), payload };
  return payload;
}

function backtest(loaded: LoadedGdpInputs, rule: AsOfRule): BacktestPoint[] {
  const quarters = [...loaded.gdp.keys()].filter((q) => q >= DATASET_FROM && q <= loaded.latestQuarter).sort();
  const rows = buildDataset(loaded, SPECS, rule, quarters);
  return runBacktest(rows, GDP_MODEL_CONFIG, BACKTEST_FROM);
}

function backtestFor(loaded: LoadedGdpInputs, key: string, rule: AsOfRule): BacktestPoint[] {
  const cacheKey = `${loaded.latestQuarter}:${key}`;
  const hit = curveCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CURVE_TTL_MS) return hit.points;
  const points = backtest(loaded, rule);
  curveCache.set(cacheKey, { at: Date.now(), points });
  return points;
}

const inTest = (p: { quarter: string }) => p.quarter >= TEST_FROM && !isCovidQuarter(p.quarter);

function accuracy(points: readonly BacktestPoint[], gdpNow?: (p: BacktestPoint) => number): GdpAccuracy {
  const y = points.map((p) => p.y);
  return {
    model: errorStats(points.map((p) => p.forecast), y),
    mean40: errorStats(points.map((p) => p.mean40), y),
    prevQ: errorStats(points.map((p) => p.prevQ), y),
    ...(gdpNow ? { gdpNow: errorStats(points.map(gdpNow), y) } : {}),
  };
}

/** 2016Q2 起、GDPNow 在同一 as-of 日有值的季度 */
function gdpNowSample(points: readonly BacktestPoint[], gdpNow: RevisionLedger | null) {
  if (!gdpNow) return [];
  return points.filter(
    (p) => p.quarter >= GDPNOW_FROM && !isCovidQuarter(p.quarter) && Number.isFinite(valueAsOf(gdpNow, p.quarter, p.asOf)),
  );
}

function curveRow(
  key: string,
  label: string,
  points: readonly BacktestPoint[],
  gdpNow: RevisionLedger | null,
  current: boolean,
): GdpCurveRow {
  const test = points.filter(inTest);
  const s = errorStats(test.map((p) => p.forecast), test.map((p) => p.y));
  const b = errorBand(test);
  const sample = gdpNowSample(points, gdpNow);
  const y = sample.map((p) => p.y);
  return {
    key,
    label,
    mae: s.mae,
    rmse: s.rmse,
    n: s.n,
    bandHalfWidth: (b.upper - b.lower) / 2,
    sameSampleModelMae: sample.length ? errorStats(sample.map((p) => p.forecast), y).mae : null,
    gdpNowMae: sample.length ? errorStats(sample.map((p) => valueAsOf(gdpNow!, p.quarter, p.asOf)), y).mae : null,
    gdpNowN: sample.length,
    current,
  };
}

export async function computeUsGdpNowcast(now = new Date()): Promise<UsGdpNowcastPayload> {
  const today = now.toISOString().slice(0, 10);
  const [loaded, gdpNow] = await Promise.all([loadUsGdpNowcastInputs(today), loadGdpNow()]);
  const target = loaded.targetQuarter;
  const offsetDays = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / DAY_MS));
  const liveRule: AsOfRule = (q, rel) => minIso(addDays(q, offsetDays), addDays(rel, -1));

  const quarters = [...loaded.gdp.keys()].filter((q) => q >= DATASET_FROM && q <= loaded.latestQuarter).sort();
  const rows = buildDataset(loaded, SPECS, liveRule, quarters);
  const targetRow = datasetRow(loaded, SPECS, target, today, null);
  const live = nowcastLive(rows, targetRow, GDP_MODEL_CONFIG);
  if (!live) throw new Error(`目标季度 ${quarterLabel(target)} 的输入不完整（检查 GDP 与月度指标版本是否已入库）`);

  const points = runBacktest(rows, GDP_MODEL_CONFIG, BACKTEST_FROM);
  const test = points.filter(inTest);
  const band = errorBand(test);
  const gdpNowAt = (p: BacktestPoint) => (gdpNow ? valueAsOf(gdpNow, p.quarter, p.asOf) : NaN);

  const curve: GdpCurveRow[] = CURVE.map((c) => curveRow(c.key, c.label, backtestFor(loaded, c.key, c.rule), gdpNow, false));
  curve.push(curveRow("now", `当前（目标季度第 ${offsetDays + 1} 天）`, points, gdpNow, true));

  const pre = backtestFor(loaded, "pre", asOfPreRelease);
  const sampleNow = gdpNowSample(points, gdpNow);
  const samplePre = gdpNowSample(pre, gdpNow);

  const recent: UsGdpNowcastPublicPayload["recent"] = [];
  for (let q = addQuarters(loaded.latestQuarter, -5); q <= loaded.latestQuarter; q = addQuarters(q, 1)) {
    recent.push({ quarter: q, first: gdpFirstRelease(loaded.gdp, q)?.growth ?? NaN, latest: gdpGrowthAsOf(loaded.gdp, q, today) });
  }

  const gdpNowLatest = gdpNow ? valueAsOf(gdpNow, target, today) : NaN;

  return {
    generatedAt: new Date().toISOString(),
    targetQuarter: target,
    latestQuarter: loaded.latestQuarter,
    asOf: today,
    offsetDays,
    nowcast: live.forecast,
    low: live.forecast + band.lower,
    high: live.forecast + band.upper,
    gdpNow: Number.isFinite(gdpNowLatest) ? { value: gdpNowLatest, sourceUrl: GDPNOW_PAGE_URL } : null,
    recent,
    curve,
    accuracy: {
      test: accuracy(test),
      vsGdpNowNow: sampleNow.length ? accuracy(sampleNow, gdpNowAt) : null,
      vsGdpNowPre: samplePre.length ? accuracy(samplePre, gdpNowAt) : null,
      testFrom: TEST_FROM,
      gdpNowFrom: GDPNOW_FROM,
    },
    backtest: points.map((p) => {
      const g = gdpNowAt(p);
      return { quarter: p.quarter, forecast: p.forecast, actual: p.y, gdpNow: Number.isFinite(g) ? g : null, covid: isCovidQuarter(p.quarter) };
    }),
    model: {
      window: GDP_MODEL_CONFIG.window,
      weightWindow: GDP_MODEL_CONFIG.weightWindow,
      equations: live.parts.map((p) => ({
        key: p.key,
        label: GDP_EQUATION_LABELS[p.key] ?? p.key,
        inputs: GDP_MODEL_CONFIG.equations.find((e) => e.key === p.key)?.inputs.slice() ?? [],
        forecast: p.forecast,
        weight: p.weight,
        intercept: p.fit.intercept,
        coef: p.fit.coef,
        n: p.fit.n,
      })),
      indicators: GDP_INDICATORS.map((d) => ({
        key: d.key,
        label: d.label,
        seriesKey: d.seriesKey,
        transform: d.transform,
        value: targetRow.x[d.key]?.value ?? null,
        observed: targetRow.x[d.key]?.observed ?? null,
      })),
      freshness: loaded.freshness,
    },
  };
}

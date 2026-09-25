/**
 * 美国 CPI 预测服务：装载输入 → 按「当月已观测天数」取高频数据 → 同口径滚动回测 → 当前 nowcast。
 *
 * 截止日：目标月已结束（CPI 公布前）取全月；否则取零售汽油价在当月的最新日期。回测、误差区间
 * 和克利夫兰联储对照都用同一截止日，保证月初给出的区间如实更宽、月末用满整月数据。
 * 结果是模型输出，按约束不写入宏观库；进程内缓存 30 分钟，按截止日的回测另缓存 6 小时。
 */
import { accuracy, correlation, errorBand, runBacktest, type AccuracyStats, type BacktestRow } from "./backtest";
import { CLEVELAND_NOWCAST_PAGE, clevelandAsOf, loadClevelandNowcast } from "./clevelandFed";
import { CPI_NOWCAST_COMPONENTS, type ComponentGroup } from "./components";
import {
  FULL_MONTH_CUTOFF,
  buildModelInputs,
  loadUsCpiNowcastInputs,
  observedCutoffDay,
  type InputFreshness,
  type LoadedInputs,
} from "./inputs";
import {
  nowcastMonth,
  prepareModel,
  toNsaYoy,
  type AggregateKey,
  type LeafKey,
  type PreparedModel,
} from "./model";
import { relativeImportanceYearFor } from "./relativeImportance";

const BACKTEST_FROM = "2018-01-01";
const RECENT_FROM = "2023-01-01";
const CACHE_TTL_MS = 30 * 60_000;
const BACKTEST_CACHE_TTL_MS = 6 * 3_600_000;
/** 精度曲线展示的截止日（外加当前截止日） */
const CURVE_CUTOFFS = [7, 14, 22, FULL_MONTH_CUTOFF];

export type HeadlineForecast = {
  /** 季调环比 % */
  mom: number;
  /** 80% 区间（同一截止日回测误差的 10%–90% 分位） */
  low: number;
  high: number;
  prevMom: number;
  nsaMom: number;
  yoy: number;
  prevYoy: number;
};

export type ComponentForecast = {
  key: string;
  label: string;
  labelEn: string;
  group: ComponentGroup;
  proxy: string;
  /** 权重（占全部项目 %） */
  weight: number;
  forecast: number;
  prevActual: number;
  /** 对总体环比的贡献（百分点） */
  contribution: number;
  prevContribution: number;
  backtestMae: number;
  mean12Mae: number;
  correlation: number;
};

export type BenchmarkAccuracy = Record<"model" | "lastMonth" | "mean12", AccuracyStats> & {
  /** 克利夫兰联储（同一截止日口径）；源站不可达时缺省 */
  cleveland?: AccuracyStats;
};

export type CutoffAccuracy = {
  /** 截止日；31 = 全月 */
  cutoffDay: number;
  allMae: number;
  coreMae: number;
  /** 总体 80% 区间宽度（百分点） */
  allBandWidth: number;
  clevelandAllMae: number | null;
  current: boolean;
};

export type UsCpiNowcastPayload = {
  generatedAt: string;
  targetMonth: string;
  latestCpiMonth: string;
  /** 本次 nowcast 用到当月第几天的高频数据；31 = 全月 */
  cutoffDay: number;
  /** 零售汽油价在目标月的最新观测日 */
  observedThrough: string | null;
  relativeImportanceYear: number;
  headline: HeadlineForecast;
  core: HeadlineForecast;
  aggregates: Record<Exclude<AggregateKey, "ALL" | "CORE">, { forecast: number; prevActual: number }>;
  components: ComponentForecast[];
  /** 本月回归无法估计、退回 12 个月均值的分项（正常为空） */
  fallbackComponents: string[];
  /** 克利夫兰联储对目标月的最新 nowcast（对照用，不入库）；读取失败为 null */
  cleveland: { all: number; core: number; label: string; sourceUrl: string } | null;
  /** 预测精度随当月观测天数的变化（2018 年以来、剔除疫情月） */
  cutoffCurve: CutoffAccuracy[];
  backtest: {
    from: string;
    to: string;
    rows: Array<{
      month: string;
      covid: boolean;
      forecastAll: number;
      actualAll: number;
      forecastCore: number;
      actualCore: number;
      clevelandAll: number | null;
      clevelandCore: number | null;
    }>;
    accuracy: Record<"exCovid" | "recent", { ALL: BenchmarkAccuracy; CORE: BenchmarkAccuracy; n: number }>;
  };
  freshness: InputFreshness[];
};

type CutoffRun = { model: PreparedModel; rows: BacktestRow[] };

let cache: { at: number; payload: UsCpiNowcastPayload } | null = null;
const runCache = new Map<string, { at: number; run: CutoffRun }>();

export async function getUsCpiNowcast(opts?: { force?: boolean }): Promise<UsCpiNowcastPayload> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = await computeUsCpiNowcast();
  cache = { at: Date.now(), payload };
  return payload;
}

/**
 * 某截止日下的模型与回测。历史月份的高频均值只取决于截止日，与当月新数据无关，
 * 故精度曲线按（最新 CPI 月, 截止日）缓存；当前截止日每次随 nowcast 重算。
 */
function runForCutoff(loaded: LoadedInputs, cutoffDay: number, reuse: boolean): CutoffRun {
  const key = `${loaded.latestCpiMonth}:${cutoffDay}`;
  const hit = runCache.get(key);
  if (reuse && hit && Date.now() - hit.at < BACKTEST_CACHE_TTL_MS) return hit.run;
  const model = prepareModel(buildModelInputs(loaded, cutoffDay));
  const rows = runBacktest(model, BACKTEST_FROM, model.months.length - 2);
  const run = { model, rows };
  runCache.set(key, { at: Date.now(), run });
  return run;
}

export async function computeUsCpiNowcast(now = new Date()): Promise<UsCpiNowcastPayload> {
  const [loaded, cleveland] = await Promise.all([loadUsCpiNowcastInputs(), loadClevelandNowcast()]);
  const { cutoffDay, observedThrough } = observedCutoffDay(
    loaded.targetMonth,
    loaded.hfDaily.GASRETAIL ?? new Map(),
    now,
  );

  const { model, rows } = runForCutoff(loaded, cutoffDay, false);
  const T = model.months.length - 1;
  const prev = T - 1;
  const fallbacks: LeafKey[] = [];
  const nowcast = nowcastMonth(model, T, fallbacks);

  const headlineFor = (key: "ALL" | "CORE"): HeadlineForecast => {
    const band = errorBand(rows, key);
    const conv = key === "ALL"
      ? toNsaYoy(model, "ALL", "ALLNSA", nowcast.ALL, T)
      : toNsaYoy(model, "CORE", "CORENSA", nowcast.CORE, T);
    return {
      mom: nowcast[key],
      low: nowcast[key] + band.lower,
      high: nowcast[key] + band.upper,
      prevMom: model.mom[key]![prev]!,
      nsaMom: conv.nsaMom,
      yoy: conv.yoy,
      prevYoy: conv.prevYoy,
    };
  };

  const exCovid = rows.filter((r) => !r.covid);
  const components: ComponentForecast[] = CPI_NOWCAST_COMPONENTS.map((c) => {
    const w = model.weights[c.key]![T]!;
    const wPrev = model.weights[c.key]![prev]!;
    const f = exCovid.map((r) => r.forecast[c.key]);
    const a = exCovid.map((r) => r.actual[c.key]);
    const mean12 = exCovid.map((r) => {
      const t = model.monthIndex.get(r.month)!;
      const xs = model.mom[c.key]!.slice(t - 12, t).filter(Number.isFinite);
      return xs.length >= 6 ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN;
    });
    const prevActual = model.mom[c.key]![prev]!;
    return {
      key: c.key,
      label: c.label,
      labelEn: c.labelEn,
      group: c.group,
      proxy: c.proxy,
      weight: w,
      forecast: nowcast[c.key],
      prevActual,
      contribution: (w * nowcast[c.key]) / 100,
      prevContribution: (wPrev * prevActual) / 100,
      backtestMae: accuracy(f, a).mae,
      mean12Mae: accuracy(mean12, a).mae,
      correlation: correlation(f, a),
    };
  });

  const cfAsOf = (month: string, key: "ALL" | "CORE", cut: number) => {
    const p = clevelandAsOf(cleveland?.get(month), cut);
    return p ? (key === "ALL" ? p.all : p.core) : NaN;
  };
  const bench = (subset: BacktestRow[], key: "ALL" | "CORE"): BenchmarkAccuracy => {
    const a = subset.map((r) => r.actual[key]);
    const cf = subset.map((r) => cfAsOf(r.month, key, cutoffDay));
    return {
      model: accuracy(subset.map((r) => r.forecast[key]), a),
      lastMonth: accuracy(subset.map((r) => r.lastMonth[key]), a),
      mean12: accuracy(subset.map((r) => r.mean12[key]), a),
      ...(cf.some(Number.isFinite) ? { cleveland: accuracy(cf, a) } : {}),
    };
  };
  const recent = exCovid.filter((r) => r.month >= RECENT_FROM);

  const cutoffCurve: CutoffAccuracy[] = [...new Set([...CURVE_CUTOFFS, cutoffDay])]
    .sort((a, b) => a - b)
    .map((c) => {
      const curveRows = c === cutoffDay ? rows : runForCutoff(loaded, c, true).rows;
      const ex = curveRows.filter((r) => !r.covid);
      const actualAll = ex.map((r) => r.actual.ALL);
      const band = errorBand(curveRows, "ALL");
      const cf = ex.map((r) => cfAsOf(r.month, "ALL", c));
      return {
        cutoffDay: c,
        allMae: accuracy(ex.map((r) => r.forecast.ALL), actualAll).mae,
        coreMae: accuracy(ex.map((r) => r.forecast.CORE), ex.map((r) => r.actual.CORE)).mae,
        allBandWidth: band.upper - band.lower,
        clevelandAllMae: cf.some(Number.isFinite) ? accuracy(cf, actualAll).mae : null,
        current: c === cutoffDay,
      };
    });

  const agg = (k: Exclude<AggregateKey, "ALL" | "CORE">) => ({ forecast: nowcast[k], prevActual: model.mom[k]![prev]! });
  const cfNow = cleveland?.get(loaded.targetMonth)?.latest ?? null;
  const cfOrNull = (month: string, key: "ALL" | "CORE") => {
    const v = cfAsOf(month, key, cutoffDay);
    return Number.isFinite(v) ? v : null;
  };

  return {
    generatedAt: new Date().toISOString(),
    targetMonth: loaded.targetMonth,
    latestCpiMonth: loaded.latestCpiMonth,
    cutoffDay,
    observedThrough,
    relativeImportanceYear: relativeImportanceYearFor(Number(loaded.targetMonth.slice(0, 4))),
    headline: headlineFor("ALL"),
    core: headlineFor("CORE"),
    aggregates: { FOOD: agg("FOOD"), ENE: agg("ENE"), CG: agg("CG"), CS: agg("CS") },
    components,
    fallbackComponents: fallbacks,
    cleveland: cfNow
      ? { all: cfNow.all, core: cfNow.core, label: cfNow.label, sourceUrl: CLEVELAND_NOWCAST_PAGE }
      : null,
    cutoffCurve,
    backtest: {
      from: rows[0]?.month ?? BACKTEST_FROM,
      to: rows[rows.length - 1]?.month ?? loaded.latestCpiMonth,
      rows: rows.map((r) => ({
        month: r.month,
        covid: r.covid,
        forecastAll: r.forecast.ALL,
        actualAll: r.actual.ALL,
        forecastCore: r.forecast.CORE,
        actualCore: r.actual.CORE,
        clevelandAll: cfOrNull(r.month, "ALL"),
        clevelandCore: cfOrNull(r.month, "CORE"),
      })),
      accuracy: {
        exCovid: { ALL: bench(exCovid, "ALL"), CORE: bench(exCovid, "CORE"), n: exCovid.length },
        recent: { ALL: bench(recent, "ALL"), CORE: bench(recent, "CORE"), n: recent.length },
      },
    },
    freshness: loaded.freshness,
  };
}

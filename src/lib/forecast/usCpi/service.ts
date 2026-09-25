/**
 * 美国 CPI 预测服务：装载输入 → 滚动回测 → 当前目标月 nowcast → 页面载荷。
 * 结果是模型输出，按约束不写入宏观库；进程内缓存 30 分钟（输入最快 6 小时更新一次）。
 */
import { accuracy, correlation, errorBand, runBacktest, type AccuracyStats } from "./backtest";
import { CPI_NOWCAST_COMPONENTS, type ComponentGroup } from "./components";
import { HF_CUTOFF_DAY, loadUsCpiNowcastInputs, type InputFreshness } from "./inputs";
import { nowcastMonth, prepareModel, toNsaYoy, type AggregateKey, type LeafKey } from "./model";
import { relativeImportanceYearFor } from "./relativeImportance";

const BACKTEST_FROM = "2018-01-01";
const RECENT_FROM = "2023-01-01";
const CACHE_TTL_MS = 30 * 60_000;

export type HeadlineForecast = {
  /** 季调环比 % */
  mom: number;
  /** 80% 区间（回测误差 10%–90% 分位） */
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

export type BenchmarkAccuracy = Record<"model" | "lastMonth" | "mean12", AccuracyStats>;

export type UsCpiNowcastPayload = {
  generatedAt: string;
  targetMonth: string;
  latestCpiMonth: string;
  hfCutoffDay: number;
  relativeImportanceYear: number;
  headline: HeadlineForecast;
  core: HeadlineForecast;
  aggregates: Record<Exclude<AggregateKey, "ALL" | "CORE">, { forecast: number; prevActual: number }>;
  components: ComponentForecast[];
  /** 本月回归无法估计、退回 12 个月均值的分项（正常为空） */
  fallbackComponents: string[];
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
    }>;
    accuracy: Record<"exCovid" | "recent", { ALL: BenchmarkAccuracy; CORE: BenchmarkAccuracy; n: number }>;
  };
  freshness: InputFreshness[];
};

let cache: { at: number; payload: UsCpiNowcastPayload } | null = null;

export async function getUsCpiNowcast(opts?: { force?: boolean }): Promise<UsCpiNowcastPayload> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = await computeUsCpiNowcast();
  cache = { at: Date.now(), payload };
  return payload;
}

export async function computeUsCpiNowcast(): Promise<UsCpiNowcastPayload> {
  const loaded = await loadUsCpiNowcastInputs();
  const model = prepareModel(loaded.inputs);
  const T = model.months.length - 1;
  const prev = T - 1;

  const rows = runBacktest(model, BACKTEST_FROM, prev);
  const fallbacks: LeafKey[] = [];
  const now = nowcastMonth(model, T, fallbacks);

  const headlineFor = (key: "ALL" | "CORE"): HeadlineForecast => {
    const band = errorBand(rows, key);
    const conv = key === "ALL"
      ? toNsaYoy(model, "ALL", "ALLNSA", now.ALL, T)
      : toNsaYoy(model, "CORE", "CORENSA", now.CORE, T);
    return {
      mom: now[key],
      low: now[key] + band.lower,
      high: now[key] + band.upper,
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
      forecast: now[c.key],
      prevActual,
      contribution: (w * now[c.key]) / 100,
      prevContribution: (wPrev * prevActual) / 100,
      backtestMae: accuracy(f, a).mae,
      mean12Mae: accuracy(mean12, a).mae,
      correlation: correlation(f, a),
    };
  });

  const bench = (subset: typeof rows, key: "ALL" | "CORE"): BenchmarkAccuracy => {
    const a = subset.map((r) => r.actual[key]);
    return {
      model: accuracy(subset.map((r) => r.forecast[key]), a),
      lastMonth: accuracy(subset.map((r) => r.lastMonth[key]), a),
      mean12: accuracy(subset.map((r) => r.mean12[key]), a),
    };
  };
  const recent = exCovid.filter((r) => r.month >= RECENT_FROM);

  const agg = (k: Exclude<AggregateKey, "ALL" | "CORE">) => ({ forecast: now[k], prevActual: model.mom[k]![prev]! });

  return {
    generatedAt: new Date().toISOString(),
    targetMonth: loaded.targetMonth,
    latestCpiMonth: loaded.latestCpiMonth,
    hfCutoffDay: HF_CUTOFF_DAY,
    relativeImportanceYear: relativeImportanceYearFor(Number(loaded.targetMonth.slice(0, 4))),
    headline: headlineFor("ALL"),
    core: headlineFor("CORE"),
    aggregates: { FOOD: agg("FOOD"), ENE: agg("ENE"), CG: agg("CG"), CS: agg("CS") },
    components,
    fallbackComponents: fallbacks,
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
      })),
      accuracy: {
        exCovid: { ALL: bench(exCovid, "ALL"), CORE: bench(exCovid, "CORE"), n: exCovid.length },
        recent: { ALL: bench(recent, "ALL"), CORE: bench(recent, "CORE"), n: recent.length },
      },
    },
    freshness: loaded.freshness,
  };
}

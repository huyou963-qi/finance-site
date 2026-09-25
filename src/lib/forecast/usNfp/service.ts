/**
 * 美国非农 nowcast 服务：装载版本账本与周度申领 → 按「今天在目标月的第几天」同口径回测 →
 * 当前 nowcast、80% 区间、精度曲线、ADP 与 SPF 第三方对照。模型输出不入库，进程内缓存 30 分钟。
 */
import { loadUsNfpNowcastInputs, type LoadedNfpInputs, type NfpFreshness } from "./inputs";
import {
  FEATURES,
  SIGNALS,
  addDays,
  addMonths,
  asOfMonthEnd,
  asOfOffset,
  asOfPreRelease,
  buildDataset,
  contributions,
  errorBand,
  errorStats,
  featuresAsOf,
  firstRelease,
  fitBefore,
  isCovid,
  minIso,
  predict,
  runBacktest,
  toDay,
  valueAsOf,
  type AsOfRule,
  type BacktestPoint,
  type ErrorStats,
  type FeatureKey,
  type FeatureRow,
  type SignalKey,
} from "./model";
import { SPF_PAGE_URL, loadSpfEmp, type SpfQuarter } from "./spf";

/** 回测从训练样本够用的第一个月开始（2007 年前后）；图表只画 2010 年以后 */
const BACKTEST_FROM = "2004-01-01";
const CHART_FROM = "2010-01-01";
const TEST_FROM = "2016-01-01";
/** ADP 的 ALFRED 首发版本自 2022-08 方法重建后才有；更早只有修订后历史，不作真实时点对照 */
const ADP_REALTIME_FROM = "2022-09-01";
const CACHE_TTL_MS = 30 * 60_000;
const CURVE_TTL_MS = 6 * 3_600_000;

export const FEATURE_LABELS: Record<SignalKey, { label: string; unit: string }> = {
  nfp12: { label: "过去 12 个月非农变化均值（实时版本）", unit: "千人" },
  icChg: { label: "参考周初请（4 周均）较上月变化", unit: "%" },
  ccChg: { label: "续请（4 周均）较上月变化", unit: "%" },
  icLvl: { label: "初请相对过去一年均值", unit: "%" },
};

type CurveKey = "d07" | "d14" | "d21" | "eom" | "pre";
const CURVE: Array<{ key: CurveKey; label: string; rule: AsOfRule }> = [
  { key: "d07", label: "目标月 7 日", rule: asOfOffset(6) },
  { key: "d14", label: "目标月 14 日", rule: asOfOffset(13) },
  { key: "d21", label: "目标月 21 日", rule: asOfOffset(20) },
  { key: "eom", label: "目标月结束", rule: asOfMonthEnd },
  { key: "pre", label: "非农公布前一天", rule: asOfPreRelease },
];

export type AccuracyRow = { model: ErrorStats; nfp6: ErrorStats; nfp1: ErrorStats; adp?: ErrorStats };

export type UsNfpNowcastPayload = {
  generatedAt: string;
  targetMonth: string;
  latestNfpMonth: string;
  asOf: string;
  /** 今天距目标月月初的天数（历史回测按同一偏移取数） */
  offsetDays: number;
  nowcast: number;
  low: number;
  high: number;
  features: Array<{ key: FeatureKey; label: string; unit: string; value: number; contribution: number }>;
  /** 仅作背景展示的申领变化（不进回归） */
  context: Array<{ key: SignalKey; label: string; unit: string; value: number }>;
  baseline: number;
  recent: Array<{ month: string; first: number; latest: number }>;
  curve: Array<{ key: string; label: string; mae: number; rmse: number; bandHalfWidth: number; current: boolean }>;
  accuracy: { test: AccuracyRow; recent: AccuracyRow; testFrom: string; recentFrom: string };
  backtest: Array<{ month: string; forecast: number; actual: number; adp: number | null; nfp6: number }>;
  adpLatest: { month: string; change: number } | null;
  spf: {
    sourceUrl: string;
    current: { quarter: string; spf: number; model: number; knownMonths: number } | null;
    rows: Array<{ quarter: string; actual: number; spf: number; model: number }>;
    stats: Record<"since2006" | "since2016" | "since2022", { n: number; spfMae: number; modelMae: number }>;
  } | null;
  freshness: NfpFreshness[];
};

let cache: { at: number; payload: UsNfpNowcastPayload } | null = null;
const curveCache = new Map<string, { at: number; points: BacktestPoint[] }>();

export async function getUsNfpNowcast(opts?: { force?: boolean }): Promise<UsNfpNowcastPayload> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;
  const payload = await computeUsNfpNowcast();
  cache = { at: Date.now(), payload };
  return payload;
}

function backtestFor(loaded: LoadedNfpInputs, key: string, rule: AsOfRule, reuse: boolean): BacktestPoint[] {
  const cacheKey = `${loaded.latestNfpMonth}:${key}`;
  const hit = curveCache.get(cacheKey);
  if (reuse && hit && Date.now() - hit.at < CURVE_TTL_MS) return hit.points;
  const rows = buildDataset(loaded, rule).filter((r) => r.month <= loaded.latestNfpMonth);
  const points = runBacktest(rows, BACKTEST_FROM);
  curveCache.set(cacheKey, { at: Date.now(), points });
  return points;
}

const inTest = (p: { month: string }) => p.month >= TEST_FROM && !isCovid(p.month);

function adpFirstChange(loaded: LoadedNfpInputs, month: string): number | null {
  if (month < ADP_REALTIME_FROM) return null;
  const fr = firstRelease(loaded.adp, month);
  return fr ? fr.change / 1000 : null; // FRED ADP 单位为人
}

function accuracyRow(points: BacktestPoint[], loaded: LoadedNfpInputs, withAdp: boolean): AccuracyRow {
  const y = points.map((p) => p.y);
  const row: AccuracyRow = {
    model: errorStats(points.map((p) => p.forecast), y),
    nfp6: errorStats(points.map((p) => p.nfp6), y),
    nfp1: errorStats(points.map((p) => p.nfp1), y),
  };
  if (withAdp) {
    const withA = points.filter((p) => adpFirstChange(loaded, p.month) != null);
    if (withA.length) {
      row.adp = errorStats(withA.map((p) => adpFirstChange(loaded, p.month)!), withA.map((p) => p.y));
    }
  }
  return row;
}

const qavg = (levels: (m: string) => number, first: string) =>
  (levels(first) + levels(addMonths(first, 1)) + levels(addMonths(first, 2))) / 3;

function spfComparison(
  loaded: LoadedNfpInputs,
  spf: SpfQuarter[],
  d14: BacktestPoint[],
  liveNowcast: number,
  today: string,
) {
  const pred14 = new Map(d14.map((p) => [p.month, p.forecast]));
  const rows: Array<{ quarter: string; actual: number; spf: number; model: number }> = [];
  let current: { quarter: string; spf: number; model: number; knownMonths: number } | null = null;
  const target = loaded.targetMonth;
  for (const q of spf) {
    if (q.year < 2006) continue;
    const m1 = `${q.year}-${String(q.quarter * 3 - 2).padStart(2, "0")}-01`;
    const m2 = addMonths(m1, 1);
    const m3 = addMonths(m1, 2);
    const spfImplied = (q.emp2 - q.emp1) / 3;
    if (m1 >= "2020-01-01" && m1 <= "2021-04-01") continue;
    // 当季尚未全部公布：用已公布首发 + 本月 nowcast 拼出本模型的当季隐含月增量
    if (target >= m1 && target <= m3) {
      const lv = (m: string) => valueAsOf(loaded.payems, m, today);
      const known = [m1, m2, m3].filter((m) => m < target).length;
      const levels = new Map<string, number>();
      let last = lv(addMonths(target, -1));
      for (let m = target; m <= m3; m = addMonths(m, 1)) {
        last += liveNowcast;
        levels.set(m, last);
      }
      const L = (m: string) => levels.get(m) ?? lv(m);
      const model = (qavg(L, m1) - qavg(L, addMonths(m1, -3))) / 3;
      current = { quarter: `${q.year}Q${q.quarter}`, spf: spfImplied, model, knownMonths: known };
      continue;
    }
    const rel3 = firstRelease(loaded.payems, m3);
    const nc = pred14.get(m2);
    if (!rel3 || nc == null) continue;
    const after = (m: string) => valueAsOf(loaded.payems, m, rel3.at);
    const actual = (qavg(after, m1) - qavg(after, addMonths(m1, -3))) / 3;
    const survey = addDays(m2, 13);
    const atSurvey = (m: string) => valueAsOf(loaded.payems, m, survey);
    const l1 = atSurvey(m1);
    if (!Number.isFinite(l1)) continue;
    const L = (m: string) => (m === m2 ? l1 + nc : m === m3 ? l1 + 2 * nc : atSurvey(m));
    const model = (qavg(L, m1) - qavg(L, addMonths(m1, -3))) / 3;
    if ([actual, model].every(Number.isFinite)) rows.push({ quarter: `${q.year}Q${q.quarter}`, actual, spf: spfImplied, model });
  }
  const stat = (from: string) => {
    const s = rows.filter((r) => r.quarter >= from);
    const mae = (f: (r: (typeof s)[number]) => number) => s.reduce((a, r) => a + Math.abs(f(r) - r.actual), 0) / s.length;
    return { n: s.length, spfMae: mae((r) => r.spf), modelMae: mae((r) => r.model) };
  };
  return {
    sourceUrl: SPF_PAGE_URL,
    current,
    rows,
    stats: { since2006: stat("2006"), since2016: stat("2016"), since2022: stat("2022") },
  };
}

export async function computeUsNfpNowcast(now = new Date()): Promise<UsNfpNowcastPayload> {
  const [loaded, spf] = await Promise.all([loadUsNfpNowcastInputs(), loadSpfEmp()]);
  const target = loaded.targetMonth;
  const today = now.toISOString().slice(0, 10);
  const offsetDays = Math.max(0, Math.round((toDay(today) - toDay(target)) / 86_400_000));
  const liveRule: AsOfRule = (t, rel) => minIso(addDays(t, offsetDays), addDays(rel, -1));

  const x = featuresAsOf(loaded, target, today);
  if (!x || !SIGNALS.every((k) => Number.isFinite(x[k]))) {
    throw new Error(`目标月 ${target} 的特征不完整（检查非农版本与初请/续请是否已入库）`);
  }
  const rows = buildDataset(loaded, liveRule).filter((r) => r.month <= loaded.latestNfpMonth);
  const fit = fitBefore(rows, target);
  if (!fit) throw new Error("训练样本不足，无法估计非农模型");
  const nowcast = predict(fit, x);
  const { baseline, parts } = contributions(fit, x);

  const points = runBacktest(rows, BACKTEST_FROM);
  const test = points.filter(inTest);
  const band = errorBand(test);

  const curve: UsNfpNowcastPayload["curve"] = CURVE.map((c) => {
    const pts = backtestFor(loaded, c.key, c.rule, true).filter(inTest);
    const s = errorStats(pts.map((p) => p.forecast), pts.map((p) => p.y));
    const b = errorBand(pts);
    return { key: c.key, label: c.label, mae: s.mae, rmse: s.rmse, bandHalfWidth: (b.upper - b.lower) / 2, current: false };
  });
  const cur = errorStats(test.map((p) => p.forecast), test.map((p) => p.y));
  curve.push({
    key: "now",
    label: `当前（目标月第 ${offsetDays + 1} 天）`,
    mae: cur.mae,
    rmse: cur.rmse,
    bandHalfWidth: (band.upper - band.lower) / 2,
    current: true,
  });

  const recentMonths: string[] = [];
  for (let m = loaded.latestNfpMonth, i = 0; i < 6; i++, m = addMonths(m, -1)) recentMonths.unshift(m);
  const recent = recentMonths.map((m) => ({
    month: m,
    first: firstRelease(loaded.payems, m)?.change ?? NaN,
    latest: valueAsOf(loaded.payems, m, today) - valueAsOf(loaded.payems, addMonths(m, -1), today),
  }));

  const pre = backtestFor(loaded, "pre", asOfPreRelease, true);
  const d14 = backtestFor(loaded, "d14", asOfOffset(13), true);
  const adpLatestMonth = [...loaded.adp.keys()].sort().at(-1);
  const adpLatestChange = adpLatestMonth ? adpFirstChange(loaded, adpLatestMonth) : null;

  return {
    generatedAt: new Date().toISOString(),
    targetMonth: target,
    latestNfpMonth: loaded.latestNfpMonth,
    asOf: today,
    offsetDays,
    nowcast,
    low: nowcast + band.lower,
    high: nowcast + band.upper,
    features: FEATURES.map((k) => ({
      key: k,
      label: FEATURE_LABELS[k].label,
      unit: FEATURE_LABELS[k].unit,
      value: x[k],
      contribution: parts[k],
    })),
    context: SIGNALS.filter((s) => !(FEATURES as readonly string[]).includes(s)).map((s) => ({
      key: s,
      label: FEATURE_LABELS[s].label,
      unit: FEATURE_LABELS[s].unit,
      value: x[s],
    })),
    baseline,
    recent,
    curve,
    accuracy: {
      test: accuracyRow(test, loaded, false),
      recent: accuracyRow(
        pre.filter((p) => p.month >= ADP_REALTIME_FROM && !isCovid(p.month)),
        loaded,
        true,
      ),
      testFrom: TEST_FROM,
      recentFrom: ADP_REALTIME_FROM,
    },
    backtest: points.filter((p) => p.month >= CHART_FROM).map((p) => ({
      month: p.month,
      forecast: p.forecast,
      actual: p.y,
      adp: adpFirstChange(loaded, p.month),
      nfp6: p.nfp6,
    })),
    adpLatest:
      adpLatestMonth && adpLatestChange != null ? { month: adpLatestMonth, change: adpLatestChange } : null,
    spf: spf ? spfComparison(loaded, spf, d14, nowcast, today) : null,
    freshness: loaded.freshness,
  };
}

export type { FeatureRow };

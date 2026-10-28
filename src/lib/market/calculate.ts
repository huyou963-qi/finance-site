import { applyMacroDerivedValue } from "@/lib/macroDerivedCalc";
import { applyMacroSeriesSteps } from "@/lib/macroCalculationEngine";
import { queryMarketData, type MarketSeries } from "./data";
import { calculateMarketSchema, MarketError } from "./schema";

type Calculation = ReturnType<typeof calculateMarketSchema.parse>;
type InputSeries = Pick<MarketSeries, "indicator" | "points">;
export function calculateSeries(p: Calculation, left: InputSeries, right?: InputSeries) {
  const binary = ["spread", "ratio", "correlation"].includes(p.operation);
  if (binary && !right) throw new MarketError("INVALID_INPUT", "该运算需要 rightIndicatorId");
  let unit = left.indicator.unit, factor = 1;
  if (p.leftConversion !== "none") {
    if (unit !== "USD/gal") throw new MarketError("UNIT_MISMATCH", "每加仑转每桶仅适用于已核实的 USD/gal 指标");
    factor = 42; unit = "USD/bbl";
  }
  if (binary && right) {
    if (left.indicator.frequency !== right.indicator.frequency || left.indicator.frequency === "unknown") throw new MarketError("FREQUENCY_MISMATCH", "禁止静默混用不同或未知频率");
    if (unit == null || unit !== right.indicator.unit) throw new MarketError("UNIT_MISMATCH", "单位不一致或未知；请明确使用受支持换算");
    if (left.indicator.instrumentType !== right.indicator.instrumentType && !p.allowDifferentInstrumentTypes) throw new MarketError("BASIS_MISMATCH", "现货、期货等口径不同；只有用户明确同意后才能启用 allowDifferentInstrumentTypes");
  }
  const points = left.points.map(x => ({ date: x.date, value: x.value == null ? null : x.value * factor }));
  const r = new Map(right?.points.map(x => [x.date, x.value]) ?? []);
  let formula = "", outputUnit = unit;
  let values: (number | null)[] = [];
  let statistic: number | null | undefined;
  const dates = points.map(p => p.date), numbers = points.map(p => p.value);
  if (p.operation === "spread" || p.operation === "ratio") {
    const op = p.operation;
    formula = p.operation === "spread" ? `${factor} × left(t) - right(t)` : `${factor} × left(t) / right(t)`;
    values = points.map(x => x.value == null || r.get(x.date) == null ? null : applyMacroDerivedValue(x.value, r.get(x.date)!, op));
    if (p.operation === "ratio") outputUnit = "ratio";
  } else if (p.operation === "rolling_mean") {
    formula = `完整 ${p.window} 个连续观测值的算术均值；包含缺失值的窗口为 null`;
    values = applyMacroSeriesSteps(dates, numbers, [{ id: "mean", type: "rollingMean", window: p.window, minPeriods: p.window }]).data;
  } else if (["min", "max", "quantile", "correlation"].includes(p.operation)) {
    const valid = points.filter(x => x.value != null && (p.operation !== "correlation" || r.get(x.date) != null));
    const nums = valid.map(x => x.value!);
    formula = p.operation === "correlation" ? "Pearson correlation on exact-date complete pairs" : p.operation === "quantile" ? `线性插值分位数 q=${p.quantile}, index=(n-1)q；仅统计分位数插值，不补原始缺失观测` : p.operation;
    if (!nums.length) statistic = null;
    else if (p.operation === "min") statistic = Math.min(...nums);
    else if (p.operation === "max") statistic = Math.max(...nums);
    else if (p.operation === "quantile") {
      nums.sort((a, b) => a - b); const index = (nums.length - 1) * p.quantile;
      statistic = nums[Math.floor(index)]! + (nums[Math.ceil(index)]! - nums[Math.floor(index)]!) * (index % 1);
    } else {
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      const ys = valid.map(x => r.get(x.date)!); const ymean = ys.reduce((s, v) => s + v, 0) / ys.length;
      const denominator = Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) * ys.reduce((s, y) => s + (y - ymean) ** 2, 0));
      statistic = nums.length < 2 || !denominator ? null : nums.reduce((s, x, i) => s + (x - mean) * (ys[i]! - ymean), 0) / denominator;
      outputUnit = "correlation";
    }
    return { formula, unit: outputUnit, statistic, sampleDates: valid.map(x => x.date), extremumDates: p.operation === "min" || p.operation === "max" ? valid.filter(x => x.value === statistic).map(x => x.date) : undefined, validSamples: valid.length, missingSamples: points.length - valid.length, points: [] };
  } else {
    const map = new Map(points.map(x => [x.date, x.value]));
    const periodMap = new Map(points.map(x => [x.date.slice(0, 7), x.value]));
    if (p.operation === "mom" && left.indicator.frequency !== "monthly") throw new MarketError("FREQUENCY_MISMATCH", "环比百分比首批仅支持原生月度序列，不静默聚合日度数据");
    formula = p.operation === "weekly_change" ? "x(t) - x(t-7 calendar days); exact date" : p.operation === "yoy" ? "100 × (x(t)/abs(x(t-1 calendar year)) - prior/abs(prior))" : p.operation === "mom" ? "100 × (x(month)-x(previous month))/abs(x(previous month))" : p.operation === "pct_change" ? "100 × (x(t)-x(previous observed date))/abs(x(previous observed date))" : "x(t)-x(previous observed date)";
    values = points.map((x, i) => {
      let previous = i > 0 ? points[i - 1]?.value ?? null : null;
      if (p.operation === "weekly_change") previous = map.get(new Date(Date.parse(x.date) - 7 * 86400000).toISOString().slice(0, 10)) ?? null;
      if (p.operation === "yoy") {
        const yearAgo = `${Number(x.date.slice(0, 4)) - 1}${x.date.slice(4)}`;
        previous = left.indicator.frequency === "monthly" ? periodMap.get(yearAgo.slice(0, 7)) ?? null : map.get(yearAgo) ?? null;
      }
      if (p.operation === "mom") { const prev = new Date(`${x.date.slice(0, 7)}-01`); prev.setUTCMonth(prev.getUTCMonth() - 1); previous = periodMap.get(prev.toISOString().slice(0, 7)) ?? null; }
      if (x.value == null || previous == null) return null;
      if (["pct_change", "mom", "yoy"].includes(p.operation)) return previous === 0 ? null : (x.value - previous) / Math.abs(previous) * 100;
      return x.value - previous;
    });
    if (["pct_change", "mom", "yoy"].includes(p.operation)) outputUnit = "%";
  }
  return { formula, unit: outputUnit, points: dates.map((date, i) => ({ date, value: values[i] != null && Number.isFinite(values[i]) ? values[i] : null })), validSamples: values.filter(v => v != null && Number.isFinite(v)).length, missingSamples: values.filter(v => v == null || !Number.isFinite(v)).length };
}
export async function calculateMarketSeries(raw: unknown) {
  const p = calculateMarketSchema.parse(raw);
  const result = await queryMarketData({ indicatorIds: [p.leftIndicatorId, ...(p.rightIndicatorId ? [p.rightIndicatorId] : [])], startDate: p.startDate, endDate: p.endDate, maxPoints: 1000 });
  if (result.truncated) throw new MarketError("RANGE_TOO_LARGE", "计算输入超过1000个日期，请缩短区间；禁止基于截断输入返回统计结果");
  const calculated = calculateSeries(p, result.series[0]!, p.rightIndicatorId === p.leftIndicatorId ? result.series[0]! : result.series[1]);
  return { ...calculated, inputs: result.series.map(s => ({ ...s.indicator, revisionFingerprint: s.revisionFingerprint })), alignment: "exact_date", missingValuePolicy: "不补值，不使用最近日期替代同日值；窗口和滞后项仅从请求区间内取数，不足时为 null", query: { startDate: p.startDate, endDate: p.endDate }, warnings: p.allowDifferentInstrumentTypes ? ["调用者明确允许比较不同品种口径；不是可互换价格"] : [] };
}

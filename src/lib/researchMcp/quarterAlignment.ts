import { z } from "zod";
import { readMarketSeries } from "@/lib/market/data";
import { indicatorId, MarketError, queryMarketSchema } from "@/lib/market/schema";
import { pearson } from "@/lib/quant/factorResearch";
import { loadResearchQuarters, quarterlyFinancialsInput, quarterlyStatementFields, quarterlyValues } from "./equity";

const dayMs = 86_400_000;
const transform = z.enum(["level", "yoy_difference", "yoy_percent"]);
type Transform = z.infer<typeof transform>;
export const fiscalAlignmentInput = quarterlyFinancialsInput.pick({ symbol: true, startDate: true, endDate: true }).extend({
  financialIndicatorId: z.string().min(1).max(80),
  financialTransform: transform.default("level"),
  macroIndicators: z.array(z.object({ indicatorId, transform: transform.default("level") }).strict()).min(1).max(4),
  macroLeadQuarters: z.array(z.number().int().min(0).max(2)).min(1).max(3).default([0, 1, 2])
    .describe("0 为同期，正数使用较早的宏观财季，与后续公司财季比较。"),
});

type Observation = { date: string; value: number | null };

export function fiscalWindowMean(points: readonly Observation[], frequency: "monthly" | "weekly", previousEnd: string, end: string) {
  const observed = points.filter(point => point.date > previousEnd && point.date <= end && point.value != null && Number.isFinite(point.value));
  const days = (Date.parse(end) - Date.parse(previousEnd)) / dayMs;
  const minimumObservations = frequency === "monthly" ? 3 : Math.floor(days / 7);
  const distinctPeriods = new Set(observed.map(p => frequency === "monthly"
    ? p.date.slice(0, 7) : Math.floor((Date.parse(p.date) + 3 * dayMs) / (7 * dayMs))));
  const complete = distinctPeriods.size >= minimumObservations;
  return {
    value: complete ? observed.reduce((sum, p) => sum + p.value! / observed.length, 0) : null,
    observations: observed.length, minimumObservations,
  };
}

function applyTransform(current: number | null, prior: number | null, mode: Transform) {
  if (mode === "level" || current == null) return current;
  if (prior == null || (mode === "yoy_percent" && prior <= 0)) return null;
  const value = mode === "yoy_difference" ? current - prior : current / prior - 1;
  return Number.isFinite(value) ? value : null;
}

export function prepareFiscalAlignment(input: z.output<typeof fiscalAlignmentInput>) {
  const days = (Date.parse(input.endDate) - Date.parse(input.startDate)) / dayMs;
  if (days < 0 || days > 3660) throw new MarketError("INVALID_INPUT", "财季区间必须按时间升序且不超过 10 年");
  if (new Set(input.macroIndicators.map(item => item.indicatorId)).size !== input.macroIndicators.length) {
    throw new MarketError("INVALID_INPUT", "请移除重复的宏观指标 ID");
  }
  const fields = quarterlyStatementFields([input.financialIndicatorId]);
  const lags = [...new Set(input.macroLeadQuarters)].sort((a, b) => a - b);
  return {
    cost: 4 + input.macroIndicators.length * (2 + Math.ceil(days / 730)),
    run: async () => {
      const historyStart = new Date(Date.parse(input.startDate) - 900 * dayMs).toISOString().slice(0, 10);
      const { symbol, quarters } = await loadResearchQuarters(input.symbol, historyStart, input.endDate);
      // Do not shift across gaps in underlying fiscal quarters.
      const runs: number[] = [];
      const financial = quarters.map((quarter, index) => {
        const previous = quarters[index - 1]?.fiscalDate;
        const gap = previous ? (Date.parse(quarter.fiscalDate) - Date.parse(previous)) / dayMs : 0;
        runs[index] = gap >= 60 && gap <= 120 ? (runs[index - 1] ?? 0) + 1 : 0;
        const { values, grossMarginSource } = quarterlyValues(quarter, fields);
        return { periodEnd: quarter.fiscalDate, value: values[0] ?? null, grossMarginSource };
      });
      const financialRows = financial.flatMap((row, index) => row.periodEnd < input.startDate ? [] : [{
        index, ...row,
        transformed: applyTransform(row.value, runs[index]! >= 4 ? financial[index - 4]!.value : null, input.financialTransform),
      }]);
      const macro = [];
      for (const requested of input.macroIndicators) {
        const series = await readMarketSeries(queryMarketSchema.parse({
          indicatorIds: [requested.indicatorId], startDate: historyStart, endDate: input.endDate, maxPoints: 1000,
        }), requested.indicatorId);
        const { frequency, name, unit, indicatorId: id } = series.indicator;
        if (frequency !== "monthly" && frequency !== "weekly") {
          throw new MarketError("FREQUENCY_MISMATCH", `仅支持原生周频或月频指标，${name}的频率不适用`);
        }
        if (series.coverage.truncated) throw new MarketError("RANGE_TOO_LARGE", "宏观观测超出范围，请缩短财季区间");
        const windows = financial.map((row, i) => {
          const previousEnd = financial[i - 1]?.periodEnd;
          return previousEnd && runs[i]! >= 1
            ? fiscalWindowMean(series.points, frequency, previousEnd, row.periodEnd) : null;
        });
        const comparisons = lags.map(lead => {
          const pairs: [financialValue: number, macroValue: number][] = [];
          const aligned = financialRows.map(row => {
            const i = row.index - lead;
            const window = i >= 0 && runs[row.index]! >= lead ? windows[i] : null;
            const baseline = window && runs[i]! >= 4 ? windows[i - 4]?.value ?? null : null;
            const macroValue = applyTransform(window?.value ?? null, baseline, requested.transform);
            if (row.transformed != null && macroValue != null) pairs.push([row.transformed, macroValue]);
            return {
              financialPeriodEnd: row.periodEnd, macroPeriodEnd: window ? financial[i]!.periodEnd : null,
              macroPreviousPeriodEnd: window ? financial[i - 1]!.periodEnd : null,
              macroPeriodMean: window?.value ?? null, macroValue,
              observations: window?.observations ?? 0, minimumObservations: window?.minimumObservations ?? null,
              paired: row.transformed != null && macroValue != null,
            };
          });
          return { macroLeadQuarters: lead, pairCount: pairs.length,
            pearson: pairs.length < 3 ? null : pearson(pairs.map(p => p[0]), pairs.map(p => p[1])), aligned };
        });
        macro.push({ indicatorId: id, name, unit, frequency, transform: requested.transform, comparisons });
      }
      return {
        symbol, startDate: input.startDate, endDate: input.endDate,
        financial: { id: fields[0]!.id, unit: fields[0]!.unit, transform: input.financialTransform,
          quarters: financialRows.map(({ periodEnd, value, transformed, grossMarginSource }) => ({ periodEnd, value, transformed, grossMarginSource })) },
        macro, aggregation: "arithmetic_mean",
        methodNote: "周/月观测按日期落入（上一财季末，当前财季末]，月频至少三个不同观测月份，周频至少区间天数除以七向下取整的不同周窗口。缺失不补；配对只用双方皆有值。同比百分比返回比例值且要求正基期；同比差值沿用原单位，比例型指标的 0.01 代表 1 个百分点。Pearson 至少三组配对，常数序列为空。使用现有历史值，可能含修订。",
      };
    },
  };
}

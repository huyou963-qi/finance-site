import { z } from "zod";
import { day, MarketError } from "@/lib/market/schema";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { getRunDetail as getBacktest, listBacktestNav, listRuns as listBacktests } from "@/lib/quant/backtestRuns";
import { getRunDetail as getRobustness, listRuns as listRobustness } from "@/lib/quant/robustnessRuns";
import { getMacroRegimeNowcast, listStoredRegimes } from "@/lib/quant/macroRegime";
import { FactorResearchDataError, runFactorResearch } from "@/lib/quant/factorResearchData";
import { FACTOR_MAP } from "@/lib/quant/factorRegistry";
import type { RobustnessExecution } from "@/lib/quant/robustnessData";

const dayMs = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const regimePath = "/quant/regime";
const factorPath = "/quant/factor-research";
export const quantReportFeatures = { backtest: "quant-backtest", robustness: "quant-robustness" } as const;
export type QuantReportKind = keyof typeof quantReportFeatures;

function validateRange(startDate: string, endDate: string, maxDays: number) {
  const days = (Date.parse(endDate) - Date.parse(startDate)) / dayMs;
  if (days < 0 || days > maxDays || endDate > today()) {
    throw new MarketError("INVALID_INPUT", "请提供有效的历史日期区间，并遵循工具的查询年限");
  }
  return days;
}

export const regimeInput = z.object({
  startDate: day.optional().describe("读取历史月度记录时提供起始日和结束日，最多 20 年。两者均省略时读取当前摘要。"),
  endDate: day.optional(),
}).strict();

export function prepareRegime(input: z.output<typeof regimeInput>) {
  const url = absoluteUrl(regimePath);
  if (input.startDate || input.endDate) {
    if (!input.startDate || !input.endDate) throw new MarketError("INVALID_INPUT", "历史查询需要起止日期");
    const { startDate, endDate } = input;
    const days = validateRange(startDate, endDate, 20 * 366);
    return { cost: 2 + Math.ceil(days / 366), run: async () => {
      const data = await listStoredRegimes({ start: startDate, end: endDate });
      return {
        mode: "stored_monthly", startDate, endDate,
        observations: data.map(row => ({
          date: row.date, growthState: row.growthState, growthDirection: row.growthDirection,
          inflationState: row.inflationState, regime: row.regime, dalioRegime: row.dalioRegime,
          recession: row.recession === 0 || row.recession === 1 ? row.recession === 1 : null,
        })),
        websiteUrl: url,
      };
    } };
  }
  return { cost: 6, run: async () => {
    const { generatedAt, asOfDate, official, live } = await getMacroRegimeNowcast();
    return {
      mode: "current", generatedAt, asOfDate,
      official: official && {
        signalDate: official.signalDate, regime: official.regime,
        growthDirection: official.growthDirection, inflationState: official.inflationState,
      },
      live: live && {
        regime: live.regime, riskDirection: live.riskDirection, inflationState: live.inflationState,
        confidence: live.confidence, coverage: live.coverage, dataThrough: live.dataThrough,
        relationToOfficial: live.relationToOfficial, confirmation: live.confirmation,
      },
      coverageNote: "月度宏观环境和实时市场定价分别展示，数据不足时返回空值。",
      websiteUrl: url,
    };
  } };
}

export const factorResearchInput = z.object({
  factorKeys: z.array(z.string().min(1).max(64)).min(1).max(4)
    .describe("最多 4 个站内因子，可先使用 list_screener_factors 取得因子 ID。"),
  startDate: day, endDate: day.describe("最多 5 年。"),
  quantiles: z.number().int().min(2).max(10).default(5),
}).strict();

export function prepareFactorResearch(input: z.output<typeof factorResearchInput>) {
  const days = validateRange(input.startDate, input.endDate, 5 * 366);
  const factorKeys = [...new Set(input.factorKeys)];
  if (factorKeys.some(key => !FACTOR_MAP.has(key))) throw new MarketError("INVALID_INPUT", "未知因子，请先查看站内因子目录");
  return { cost: 8 + factorKeys.length * (3 + Math.ceil(days / 366)), run: async () => {
    try {
      const report = await runFactorResearch(factorKeys, {
        start: input.startDate, end: input.endDate, quantiles: input.quantiles, maxPanelRows: 300_000,
      });
      return {
        startDate: report.start, endDate: report.end, periods: report.gridDates.length, symbolCount: report.symbolCount,
        factors: report.factors.map(factor => {
          const { quantiles, meanGroupReturns, geomGroupReturns, groupNav, groupVol, groupN, meanSpread, spreadN, spreadIR } = factor.layering;
          return {
            factorKey: factor.factorKey, name: factor.nameZh, higherIsBetter: factor.higherIsBetter,
            ic: factor.icSummary.n ? factor.icSummary : null,
            neutralizedIc: factor.neutralizedIcSummary.n ? factor.neutralizedIcSummary : null,
            icByRegime: Object.fromEntries(Object.entries(factor.icByRegime).map(([key, summary]) => [key, summary.n ? summary : null])),
            icDecay: factor.icDecay,
            layering: { quantiles, meanGroupReturns, geomGroupReturns, groupNav, groupVol, groupN,
              meanSpread: spreadN ? meanSpread : null, spreadN, spreadIR: spreadN ? spreadIR : null },
          };
        }),
        correlation: report.correlation, regimeAvailable: report.regimeAvailable,
        coverageNote: "分组从低因子值排到高因子值。分层收益为比例值。多期前瞻窗口可能重叠。",
        websiteUrl: absoluteUrl(factorPath),
      };
    } catch (error) {
      if (error instanceof FactorResearchDataError) throw new MarketError(error.code, error.message);
      throw error;
    }
  } };
}

export const quantReportPage = {
  offset: z.number().int().min(0).max(10_000).default(0),
  limit: z.number().int().min(1).max(100).default(20),
};
export const quantReportSection = z.enum(["summary", "regime_periods", "nav", "details"]);

export function validateQuantReportSection(kind: QuantReportKind, section: z.output<typeof quantReportSection>) {
  if ((kind === "backtest" && section === "details") || (kind === "robustness" && section === "regime_periods")) {
    throw new MarketError("INVALID_INPUT", "该报告类型不支持所选分段");
  }
}

const reportPath = (kind: QuantReportKind, id?: string) => absoluteUrl(`/quant/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`);

export async function listMyQuantReports(userId: string, kind: QuantReportKind, offset: number, limit: number) {
  const list = kind === "backtest" ? listBacktests : listRobustness;
  const runs = await list(userId, { completedOnly: true, offset, limit: limit + 1 });
  return {
    kind, reports: runs.slice(0, limit).map(({ error: _error, ...run }) => ({ ...run, websiteUrl: reportPath(kind, run.id) })),
    nextOffset: runs.length > limit ? offset + limit : null,
    websiteUrl: reportPath(kind),
  };
}

function pageRows<T>(rows: T[], offset: number, limit: number) {
  return { rows: rows.slice(offset, offset + limit), nextOffset: rows.length > offset + limit ? offset + limit : null };
}

function robustnessSummary(run: RobustnessExecution | null) {
  if (!run) return null;
  return {
    effectiveStart: run.effectiveStart, end: run.end, rebalanceCount: run.rebalanceCount, symbolCount: run.symbolCount,
    gridSize: run.gridSize,
    scan: run.scan ? { selectMetric: run.scan.selectMetric, bestIndex: run.scan.bestIndex, deflated: run.scan.deflated } : null,
    outOfSample: run.oos ? {
      splitDate: run.oos.splitDate, winnerLabel: run.oos.winnerLabel, inSampleMetrics: run.oos.isMetrics,
      outOfSampleMetrics: run.oos.oosMetrics, degradation: run.oos.degradation, deflated: run.oos.deflated,
    } : null,
    walkforward: run.walkforward ? { overallMetrics: run.walkforward.overallMetrics, fixedStrategy: run.walkforward.fixedStrategy } : null,
  };
}

export async function getMyQuantReport(userId: string, kind: QuantReportKind, runId: string,
  section: z.output<typeof quantReportSection>, offset: number, limit: number) {
  const websiteUrl = reportPath(kind, runId);
  if (kind === "backtest") {
    const run = await getBacktest(runId, userId, false, { ownCompleted: true });
    if (!run) throw new MarketError("NOT_FOUND", "未找到属于你的已完成回测");
    const summary = {
      id: run.id, name: run.name, finishedAt: run.finishedAt, metrics: run.metrics,
      effectiveStart: run.summary?.effectiveStart ?? null, params: run.params,
      rebalanceCount: run.summary?.rebalanceCount ?? null, symbolCount: run.summary?.symbolCount ?? null,
      regimeCoverage: run.summary?.regimeCoverage ?? null, websiteUrl,
    };
    if (section === "nav") {
      const nav = await listBacktestNav(runId, { offset, limit: limit + 1 });
      return { ...summary, section, rows: nav.slice(0, limit), nextOffset: nav.length > limit ? offset + limit : null };
    }
    if (section === "regime_periods") return { ...summary, section, ...pageRows(run.summary?.periods ?? [], offset, limit) };
    return { ...summary, section };
  }
  const run = await getRobustness(runId, userId, true, { ownCompleted: true });
  if (!run) throw new MarketError("NOT_FOUND", "未找到属于你的已完成稳健性报告");
  const summary = { id: run.id, name: run.name, mode: run.mode, finishedAt: run.finishedAt, summary: run.summary,
    report: robustnessSummary(run.result), websiteUrl };
  if (section === "details") {
    const rows = run.result?.scan?.points ?? run.result?.oos?.isScan ?? run.result?.walkforward?.folds ?? [];
    return { ...summary, section, ...pageRows<(typeof rows)[number]>(rows, offset, limit) };
  }
  if (section === "nav") {
    const oos = run.result?.oos;
    const walkforward = run.result?.walkforward;
    const rows = oos
      ? [...oos.isNav.map(row => ({ ...row, sample: "in_sample" })), ...oos.oosNav.map(row => ({ ...row, sample: "out_of_sample" }))]
      : walkforward?.stitchedNav ?? [];
    return { ...summary, section, ...pageRows<(typeof rows)[number]>(rows, offset, limit) };
  }
  return { ...summary, section };
}

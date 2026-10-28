import { z } from "zod";

export class MarketError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "日期无效");
export const indicatorId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_:=-]+$/);
export const searchIndicatorsSchema = z.object({ query: z.string().trim().min(1).max(200), category: z.string().max(64).optional(), limit: z.number().int().min(1).max(40).default(20) }).strict();
export const queryMarketSchema = z.object({
  indicatorIds: z.array(indicatorId).min(1).max(8), startDate: day, endDate: day,
  frequency: z.enum(["native", "daily", "weekly", "monthly", "quarterly", "annual"]).default("native").describe("只校验原生频率，不静默重采样"),
  maxPoints: z.number().int().min(1).max(1000).default(500).describe("每页共同日期数上限；按指标数量进一步限制总点数不超过2000"), cursor: day.optional().describe("上一页 nextCursor；所有指标严格晚于此日"),
  dataCutoff: z.string().datetime({ offset: true }).optional().describe("可选：仅读取版本账本在该时点已证明可见的值；缺少版本不退回最新值"),
}).strict().superRefine((p, ctx) => {
  if (p.startDate > p.endDate || Date.parse(p.endDate) - Date.parse(p.startDate) > 366 * 86400000 * 30) ctx.addIssue({ code: "custom", message: "区间必须按时间升序且不超过30年" });
  if (p.dataCutoff && Date.parse(p.dataCutoff) > Date.now()) ctx.addIssue({ code: "custom", message: "数据可见截止时间不能在未来" });
});
export const calculateMarketSchema = z.object({
  operation: z.enum(["spread", "ratio", "change", "pct_change", "weekly_change", "rolling_mean", "yoy", "mom", "min", "max", "quantile", "correlation"]),
  leftIndicatorId: indicatorId, rightIndicatorId: indicatorId.optional(), startDate: day, endDate: day,
  alignment: z.literal("exact_date").default("exact_date"), window: z.number().int().min(2).max(260).default(4),
  quantile: z.number().min(0).max(1).default(0.5),
  leftConversion: z.enum(["none", "usd_per_gallon_to_usd_per_barrel"]).default("none"),
  allowDifferentInstrumentTypes: z.boolean().default(false).describe("仅在用户明确同意比较现货与期货等不同口径时为 true"),
}).strict();
export const chartIdSchema = z.string().regex(/^[a-zA-Z0-9_-]+:[0-5]$/).max(140);
/** App Router page segments may retain percent escapes; decode once, then apply the same whitelist. */
export function parseChartRouteId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const parsed = chartIdSchema.safeParse(decodeURIComponent(value)); return parsed.success ? parsed.data : null; } catch { return null; }
}
export const searchChartsSchema = z.object({ query: z.string().max(200).default(""), tags: z.array(z.string().max(40)).max(12).default([]), limit: z.number().int().min(1).max(40).default(20) }).strict();
export const getChartSchema = z.object({ chartId: chartIdSchema }).strict();
export const chartDisplaySchema = z.object({ height: z.number().int().min(260).max(800).default(420), showSource: z.boolean().default(true), showLastUpdated: z.boolean().default(true), allowTimeRangeChange: z.boolean().default(true) }).strict();
export const attachChartSchema = z.object({
  articleId: z.string().uuid(), chartId: chartIdSchema,
  placement: z.discriminatedUnion("type", [z.object({ type: z.literal("end") }).strict(), z.object({ type: z.literal("after_heading"), heading: z.string().trim().min(1).max(200) }).strict()]).default({ type: "end" }),
  displayOptions: chartDisplaySchema.default({ height: 420, showSource: true, showLastUpdated: true, allowTimeRangeChange: true }),
  renderMode: z.enum(["live", "snapshot"]).default("live"), dataCutoff: z.string().datetime({ offset: true }).optional(), displayStartDate: day, displayEndDate: day,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((p, ctx) => {
  if (p.displayStartDate > p.displayEndDate) ctx.addIssue({ code: "custom", message: "图表时间范围无效" });
  if (p.renderMode === "live" && p.dataCutoff) ctx.addIssue({ code: "custom", message: "实时模式不接受历史可见截止时间，请选 snapshot" });
});

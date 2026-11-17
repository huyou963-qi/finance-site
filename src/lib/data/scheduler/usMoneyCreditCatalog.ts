import type { DataGranularity } from "@prisma/client";

/** Fed native H.6 / H.8 series; store published levels, never derived growth rates. */
export const US_MONEY_CREDIT_SERIES = [
  { fredId: "M1SL", name: "M1 货币供应量（季调；2020-05口径变更）", start: "1959-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "M2SL", name: "M2 货币供应量（季调）", start: "1959-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "CURRSL", name: "M1 流通现金分项（季调）", start: "1959-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "DEMDEPSL", name: "活期存款（H.6，季调）", start: "1959-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "MDLM", name: "其他流动存款（季调；2020-05起）", start: "2020-05-01", sa: "SA", group: "货币供应量" },
  { fredId: "STDSL", name: "小额定期存款（季调）", start: "1959-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "RMFSL", name: "零售货币市场基金（季调）", start: "1973-01-01", sa: "SA", group: "货币供应量" },
  { fredId: "BOGMBASE", name: "基础货币总额（未季调）", start: "1959-01-01", sa: "NSA", group: "基础货币与准备金" },
  { fredId: "TOTRESNS", name: "存款机构总准备金（未季调）", start: "1959-01-01", sa: "NSA", group: "基础货币与准备金" },
  { fredId: "TOTBKCR", name: "商业银行总信贷（周度，季调）", start: "1973-01-03", sa: "SA", group: "银行信贷" },
  { fredId: "TOTLL", name: "商业银行贷款与租赁（周度，季调）", start: "1973-01-03", sa: "SA", group: "银行信贷" },
  { fredId: "DPSACBW027SBOG", name: "商业银行存款（周度，季调）", start: "1973-01-03", sa: "SA", group: "银行存款" },
].map((r) => ({
  ...r, code: `sched_fred_${r.fredId}`, unit: "十亿美元",
  category: ["银行信贷", "银行存款"].includes(r.group) ? "金融条件与银行" : "货币政策与流动性",
  freqLabel: r.start === "1973-01-03" ? "周" as const : "月" as const,
  granularity: (r.start === "1973-01-03" ? "WEEKLY" : "MONTHLY") as DataGranularity,
  releasePackageId: r.start === "1973-01-03" ? "us.frb.h8_bank_assets" : "us.fed.m2",
  releaseId: r.start === "1973-01-03" ? 22 : 21,
}));

export const H6_MONEY_IDS = US_MONEY_CREDIT_SERIES.filter(r => r.releaseId === 21).map(r => r.fredId);
export const H8_CORE_IDS = US_MONEY_CREDIT_SERIES.filter(r => r.releaseId === 22).map(r => r.fredId);

export function moneyCreditRule(row: typeof US_MONEY_CREDIT_SERIES[number]) {
  // H.6 uses the existing FRED release-21 calendar. H.8 probes at most every 24h.
  return row.releaseId === 21
    ? { type: "economic_calendar" as const, releaseDelayMinutes: 3, postReleaseProbeHours: 2,
        fallback: { type: "probe_interval" as const, intervalHours: 72 } }
    : { type: "probe_interval" as const, intervalHours: 24 };
}

export function moneyCreditNotes(id: string): string {
  if (id === "M1SL") return "2020-05起纳入储蓄存款，存在定义断点；跨断点同比/环比不能解释为同口径货币扩张。";
  if (id === "TOTRESNS") return "2020-04以前含用于满足准备金要求的库存现金；此后总准备金为准备金余额。";
  if (id === "BOGMBASE") return "基础货币=流通中现金+准备金余额；未季调，区别于M1现金分项CURRSL。";
  if (id === "MDLM") return "含其他可签支票存款及储蓄存款（含货币市场存款账户）；2020-05起，不拼接已停更旧序列。";
  if (id === "RMFSL") return "零售货币市场基金，不代表全部货币基金；不含机构货币市场基金。";
  return "保存美联储官方原始水平值；同比、环比、比率仅在图表层计算，不另建观测。";
}

import type { DataGranularity } from "@prisma/client";

export const CP_WEEKLY_PACKAGE = "us.frb.commercial_paper_outstanding";
export const CP_OFFICIAL_URL = "https://www.federalreserve.gov/releases/cp/about.htm";
export type FinancingFredRow = {
  fredId: string; code: string; name: string; displayName: string;
  freqLabel: string; granularity: DataGranularity; unit: string;
  releasePackageId: string; sourceUpdateNote: string;
};
/** Official weekly balances only; changes are calculated at query time. */
export const CP_FRED_SERIES: readonly FinancingFredRow[] = [
  ...([
    ["COMPUTN", "全市场"], ["COMPAPER", "非金融企业"],
    ["FINCPN", "金融企业"], ["ABCOMPN", "资产支持"],
  ] as const).map(([fredId, scope]) => {
    const name = `美国商业票据：${scope}余额（周三，未季调）`;
    return { fredId, code: `sched_fred_${fredId}`, name, displayName: name,
      freqLabel: "周", granularity: "WEEKLY" as const, unit: "十亿美元",
      releasePackageId: CP_WEEKLY_PACKAGE,
      sourceUpdateNote: "美联储 CP：周三期末余额，通常周四发布；未季调；保留官方原值和修订，不将月末余额混入周序列。" };
  }),
];
export const CP_FRED_IDS = new Set(CP_FRED_SERIES.map((row) => row.fredId));

export const FINANCING_CODES = CP_FRED_SERIES.map((row) => row.code);
export const FINANCING_PROBE_HOURS = 168;
/** Only the empty daily definitions introduced by this task; never touch unrelated daily sources. */
export const WITHDRAWN_DAILY_CODES = [
  ...["14", "59", "1020", "2140", "4180", "GT80"].flatMap((bucket) =>
    ["AMT", "VOL"].map((suffix) => `sched_fred_MKT${bucket}MKT${suffix}`)),
  ...["marketable", "nonmarketable"].flatMap((market) =>
    ["issues", "redemptions"].map((type) => `treasury_dts_debt_${market}_${type}`)),
];
export const WITHDRAWN_DAILY_PACKAGES = ["us.frb.commercial_paper_issuance", "us.treasury.dts_debt_transactions"];

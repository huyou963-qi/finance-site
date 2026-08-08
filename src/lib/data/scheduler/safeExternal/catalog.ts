/** 国家外汇管理局公开的外汇、跨境收支与国际收支统计表。 */
export const SAFE_EXTERNAL_SYNC_SCRIPT = "scripts/data-worker/sync-safe-external.ts";
export const SAFE_EXTERNAL_SOURCE = { id: "safe-external", agencyId: "cn-safe", name: "国家外汇管理局外汇与国际收支统计", baseUrl: "https://www.safe.gov.cn/safe/tjsj1/index.html", termsUrl: "https://www.safe.gov.cn/safe/flsm/index.html" } as const;

export type SafeDataset = "reserve" | "settlement" | "payments" | "bop" | "iip" | "debt";
export const SAFE_DATASETS: readonly { key: SafeDataset; label: string; category: string; pages: readonly string[] }[] = [
  { key: "reserve", label: "官方储备资产", category: "外汇储备与黄金", pages: ["https://www.safe.gov.cn/safe/2018/0408/8730.html", "https://www.safe.gov.cn/safe/2026/0205/27113.html"] },
  { key: "settlement", label: "银行结售汇", category: "外汇收支与跨境资金", pages: ["https://www.safe.gov.cn/safe/2023/0215/22329.html"] },
  { key: "payments", label: "银行代客涉外收付款", category: "外汇收支与跨境资金", pages: ["https://www.safe.gov.cn/safe/2018/0419/8806.html"] },
  { key: "bop", label: "国际收支平衡表", category: "国际收支与对外头寸", pages: ["https://www.safe.gov.cn/safe/2019/0627/13519.html"] },
  { key: "iip", label: "国际投资头寸表", category: "国际收支与对外头寸", pages: ["https://www.safe.gov.cn/safe/2019/0627/13520.html"] },
  { key: "debt", label: "全口径外债", category: "国际收支与对外头寸", pages: ["https://www.safe.gov.cn/safe/2018/0329/8810.html"] },
] as const;

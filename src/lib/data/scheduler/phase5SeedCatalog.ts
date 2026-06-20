import { SourceAdapterKind } from "@prisma/client";

/** e-Stat statsDataId 试点（需 ESTAT_APP_ID） */
export const PHASE5_ESTAT_JPOV = [
  {
    instrumentCode: "jpov_c09_cpi_yoy",
    statsDataId: "0003410379",
    cdCat01: "0000010101",
    label: "CPI 指数（同比在 worker 内计算）",
  },
  {
    instrumentCode: "jpov_c21_unrate_sa",
    statsDataId: "0000010101",
    cdCat01: "002005002001-002005002015",
    label: "失业率（季调）",
  },
] as const;

export const PHASE5_DATA_SOURCES = {
  "estat-jp": {
    id: "estat-jp",
    agencyId: null as string | null,
    name: "日本 e-Stat API",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData",
    termsUrl: "https://www.e-stat.go.jp/api/",
    rateLimit: { minIntervalMs: 1200 },
    metadata: { requiresEnv: "ESTAT_APP_ID" },
  },
} as const;

/** 仍无 FRED/复合/e-Stat 映射的 usov 序列（继续依赖 xlsx 或手工） */
export const USOV_MANUAL_REMAINING = [
  "usov_c14_ism_nm_pmi",
  "usov_c28_sp500_pe",
] as const;

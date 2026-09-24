import { SourceAdapterKind } from "@prisma/client";

/** 旧 jpov Excel 试点已删除；日本 CPI/失业率使用标准序列。 */
export const PHASE5_ESTAT_JPOV: readonly {
  instrumentCode: string; statsDataId: string; cdCat01: string; label: string;
}[] = [];

export const PHASE5_DATA_SOURCES = {
  "estat-jp": {
    id: "estat-jp",
    agencyId: null as string | null,
    name: "日本 e-Stat API",
    adapterKind: SourceAdapterKind.REST_API,
    baseUrl: "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData",
    termsUrl: "https://www.e-stat.go.jp/api/en/terms-of-use",
    rateLimit: { minIntervalMs: 1200 },
    metadata: {
      requiresEnv: "ESTAT_APP_ID",
      publicServiceCreditRequired: true,
      publicServiceCredit: "This service uses API functions from e-Stat, however its contents are not guaranteed by government.",
      creditUrl: "https://www.e-stat.go.jp/api/en/api-info/credit/",
    },
  },
} as const;

/** 仍无 FRED/复合/e-Stat 映射的 usov 序列（继续依赖 xlsx 或手工） */
export const USOV_MANUAL_REMAINING: readonly string[] = [];

import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import type { ReleaseRule } from "./releaseRule";

/**
 * 地区联储制造业景气调查（Current General Business/Activity 分项）。
 *
 * 这三条序列各自独立发布（各自的 FRED Release 不同：Empire State Manufacturing
 * Survey / Manufacturing Business Outlook Survey / Texas Manufacturing Outlook
 * Survey），彼此不共享官方日历，故各建一个 probePkg（做法对齐既有
 * `us.chicagofed.cfnai`：无需精确匹配发布日，按月度探测即可捕获新值）。
 *
 * 只入库当月最广泛跟踪的 "Current General Business Conditions/Activity"
 * 主指数分项，不含 Future/6-month-ahead 分项。
 */
export type RegionalFedSurveyFredSeedRow = {
  fredId: string;
  code: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  source: string;
  sourceUpdateNote: string;
  releasePackageId: string;
};

export const REGIONAL_FED_SURVEY_FRED_SERIES: readonly RegionalFedSurveyFredSeedRow[] = [
  {
    fredId: "GACDISA066MSFRBNY",
    code: "sched_fred_GACDISA066MSFRBNY",
    name: "Current General Business Conditions; Diffusion Index for New York",
    displayName: "纽约联储帝国州制造业指数（现况）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数",
    category: "景气调查",
    source: "New York Fed/FRED",
    sourceUpdateNote: "每月最后一个营业日前后发布（Empire State Manufacturing Survey）",
    releasePackageId: "us.nyfed.empire_state",
  },
  {
    fredId: "GACDFSA066MSFRBPHI",
    code: "sched_fred_GACDFSA066MSFRBPHI",
    name: "Current General Activity; Diffusion Index for Federal Reserve District 3: Philadelphia",
    displayName: "费城联储制造业指数（现况）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数",
    category: "景气调查",
    source: "Federal Reserve Bank of Philadelphia/FRED",
    sourceUpdateNote: "每月第三个周四前后发布（Manufacturing Business Outlook Survey）",
    releasePackageId: "us.philadelphiafed.mbos",
  },
  {
    fredId: "BACTSAMFRBDAL",
    code: "sched_fred_BACTSAMFRBDAL",
    name: "Current General Business Activity; Diffusion Index for Texas",
    displayName: "达拉斯联储得州制造业展望指数（现况）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "指数",
    category: "景气调查",
    source: "Federal Reserve Bank of Dallas/FRED",
    sourceUpdateNote: "每月最后一个营业日前后发布（Texas Manufacturing Outlook Survey）",
    releasePackageId: "us.dallasfed.tmos",
  },
] as const;

export function buildRegionalFedSurveyInstrumentMetadata(
  item: RegionalFedSurveyFredSeedRow,
  opts?: {
    existing?: Record<string, unknown> | null;
    dataLastObsDateIso?: string | null;
  },
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ...(opts?.existing ?? {}),
    sourceTag: "regional-fed-surveys-fred-seed",
    source: item.source,
    sourceUpdateNote: item.sourceUpdateNote,
    countryCode: "US",
    countryNameZh: "美国",
    displayName: item.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: item.code,
      fredId: item.fredId,
      label: item.displayName,
      legacyCategory: item.category,
    }),
    freqLabel: item.freqLabel,
    unit: item.unit,
    catalogKey: `fred:${item.fredId}`,
  };
  if (opts?.dataLastObsDateIso) metadata.dataLastObsDateIso = opts.dataLastObsDateIso;
  return metadata;
}

/** 三条序列各自独立发布，月频探测（对齐 us.chicagofed.cfnai 的 72 小时间隔）。 */
export function releaseRuleForRegionalFedSurvey(): ReleaseRule {
  return { type: "probe_interval", intervalHours: 72 };
}

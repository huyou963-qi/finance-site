import type { DataGranularity } from "@prisma/client";
import { usMetadataCatalogCategory } from "@/lib/data/usCatalogTaxonomy";
import {
  TREASURY_SOURCE_SPEC_BY_KEY,
  treasurySourceSpecKey,
  type TreasurySourceSpec,
} from "./treasuryFiscalData/types";

export type TreasuryFiscalSeedRow = {
  code: string;
  roleId: string;
  sourceKey: string;
  name: string;
  displayName: string;
  freqLabel: string;
  granularity: DataGranularity;
  unit: string;
  category: string;
  sourceSpec: TreasurySourceSpec;
  sourceUpdateNote: string;
};

function rowFromKey(
  roleId: string,
  code: string,
  sourceKey: string,
  displayName: string,
  freqLabel: string,
  granularity: DataGranularity,
  unit: string,
  sourceUpdateNote: string,
): TreasuryFiscalSeedRow {
  const sourceSpec = TREASURY_SOURCE_SPEC_BY_KEY[sourceKey];
  if (!sourceSpec) throw new Error(`未注册 Treasury 短键：${sourceKey}`);
  return {
    code,
    roleId,
    sourceKey,
    name: displayName,
    displayName,
    freqLabel,
    granularity,
    unit,
    category: "财政",
    sourceSpec,
    sourceUpdateNote,
  };
}

/** Treasury Fiscal Data API — 已验证可拉取的序列 */
export const TREASURY_FISCAL_SERIES: readonly TreasuryFiscalSeedRow[] = [
  rowFromKey(
    "us-mts-deficit-fytd",
    "treasury_mts_m01_deficit_fytd",
    "mts1:deficit_fytd",
    "MTS 联邦财年累计赤字（FYTD）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制；FY 10/1 起逐月累加",
  ),
  rowFromKey(
    "us-mts-receipts-fytd",
    "treasury_mts_m01_receipts_fytd",
    "mts1:receipts_fytd",
    "MTS 联邦财年累计收入（FYTD）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制；FY 10/1 起逐月累加",
  ),
  rowFromKey(
    "us-mts-outlays-fytd",
    "treasury_mts_m01_outlays_fytd",
    "mts1:outlays_fytd",
    "MTS 联邦财年累计支出（FYTD）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制；FY 10/1 起逐月累加",
  ),
  rowFromKey(
    "us-receipts-excise-tax",
    "treasury_mts_m09_rcpt_excise",
    "mts9:excise",
    "MTS 消费税（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 分项（Excise Taxes）",
  ),
  rowFromKey(
    "us-outlays-defense",
    "treasury_mts_m09_outlay_defense",
    "mts9:defense",
    "MTS 国防支出（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 功能分类 National Defense",
  ),
  rowFromKey(
    "us-outlays-social-security",
    "treasury_mts_m09_outlay_social_security",
    "mts9:social_security",
    "MTS 社保支出（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 功能分类 Social Security",
  ),
  rowFromKey(
    "us-outlays-medicare",
    "treasury_mts_m09_outlay_medicare",
    "mts9:medicare",
    "MTS 医保支出（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 功能分类 Medicare",
  ),
  rowFromKey(
    "us-mts-receipts",
    "treasury_mts_m01_receipts",
    "mts1:receipts",
    "MTS 联邦现金收入（月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制（FY 月对齐 record_date）",
  ),
  rowFromKey(
    "us-mts-outlays",
    "treasury_mts_m01_outlays",
    "mts1:outlays",
    "MTS 联邦现金支出（月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制（FY 月对齐 record_date）",
  ),
  rowFromKey(
    "us-mts-deficit",
    "treasury_mts_m01_deficit",
    "mts1:deficit",
    "MTS 联邦月赤字（月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 1 现金制（FY 月对齐 record_date）",
  ),
  rowFromKey(
    "us-receipts-individual-tax",
    "treasury_mts_m09_rcpt_individual",
    "mts9:individual_income",
    "MTS 个人所得税（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 分项（发布月 record_date）",
  ),
  rowFromKey(
    "us-receipts-corporate-tax",
    "treasury_mts_m09_rcpt_corporate",
    "mts9:corporate_income",
    "MTS 企业所得税（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 分项（发布月 record_date）",
  ),
  rowFromKey(
    "us-receipts-payroll-tax",
    "treasury_mts_m09_rcpt_payroll",
    "mts9:payroll",
    "MTS 社保/退休税（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 分项（发布月 record_date）",
  ),
  rowFromKey(
    "us-outlays-net-interest",
    "treasury_mts_m09_outlay_interest",
    "mts9:net_interest",
    "MTS 净利息支出（现金，月）",
    "月",
    "MONTHLY",
    "美元",
    "Treasury MTS Table 9 功能分类 Net Interest",
  ),
  rowFromKey(
    "us-tga-balance",
    "treasury_dts_tga_balance",
    "dts:tga_close",
    "TGA 余额（日）",
    "日",
    "DAILY",
    "百万美元",
    "Treasury DTS Operating Cash Balance（TGA 收盘）",
  ),
  rowFromKey(
    "us-dts-daily-deficit",
    "treasury_dts_daily_net_cash",
    "dts:daily_net_cash",
    "DTS 日净现金流（Deposits−Withdrawals）",
    "日",
    "DAILY",
    "百万美元",
    "DTS Table II 汇总：Total TGA Deposits − Total TGA Withdrawals（现金制日赤字代理）",
  ),
  rowFromKey(
    "us-net-issuance-weekly",
    "treasury_debt_penny_net_weekly",
    "debt:penny_net_weekly",
    "公共债务周净增发",
    "周",
    "WEEKLY",
    "美元",
    "Debt to the Penny 日频 tot_pub_debt_out_amt 按 ISO 周差分",
  ),
  rowFromKey(
    "us-outlays-mandatory",
    "treasury_mts_m09_mandatory_proxy",
    "mts9:mandatory_proxy",
    "MTS 强制性支出代理（月）",
    "月",
    "MONTHLY",
    "美元",
    "MTS Table 9 功能分类求和（SS/Medicare/Health/Income/Veterans）；非 CBO 法定口径",
  ),
  rowFromKey(
    "us-outlays-discretionary",
    "treasury_mts_m09_discretionary_proxy",
    "mts9:discretionary_proxy",
    "MTS 可自由裁量支出代理（月）",
    "月",
    "MONTHLY",
    "美元",
    "MTS Table 9 功能分类求和（国防/教育/交通等）；非 OMB 预算授权口径",
  ),
] as const;

export function treasurySourceSeriesKey(row: TreasuryFiscalSeedRow): string {
  return treasurySourceSpecKey(row.sourceKey);
}

export function buildTreasuryInstrumentMetadata(
  row: TreasuryFiscalSeedRow,
  opts?: {
    dataLastObsDateIso?: string | null;
    fetchUrl?: string;
    sampleObsDate?: string;
    sampleValue?: number;
    existing?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const fetchUrl =
    opts?.fetchUrl ??
    `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/${row.sourceSpec.endpoint}`;
  return {
    ...(opts?.existing ?? {}),
    sourceTag: "treasury-fiscal-seed",
    source: "Treasury Fiscal Data",
    sourceUpdateNote: row.sourceUpdateNote,
    officialUrl: "https://fiscaldata.treasury.gov/",
    countryCode: "US",
    countryNameZh: "美国",
    displayName: row.displayName,
    catalogCategory: usMetadataCatalogCategory({
      code: row.code,
      label: row.displayName,
      legacyCategory: row.category,
    }),
    freqLabel: row.freqLabel,
    unit: row.unit,
    catalogKey: `treasury:${row.code}`,
    roleId: row.roleId,
    fetchAcquisition: {
      status: "known",
      probedAt: new Date().toISOString(),
      method: "treasury_fiscal_data_api",
      methodLabel: "Treasury Fiscal Data REST API",
      officialUrl: "https://fiscaldata.treasury.gov/",
      fetchUrl,
      sampleObsDate: opts?.sampleObsDate,
      sampleValue: opts?.sampleValue,
      message: row.sourceUpdateNote,
    },
  };
}

export const TREASURY_FISCAL_PENDING_ROLE_IDS = [
  "us-financial-report-net-operating-cost",
  "us-financial-report-net-position",
  "us-financial-report-ss-medicare-pv-gap",
  "us-financial-report-contingent-liabilities",
] as const;

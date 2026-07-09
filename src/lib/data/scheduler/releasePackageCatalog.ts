import type { DataGranularity } from "@prisma/client";
import { CPI_FRED_SERIES } from "./cpiFredSeedCatalog";
import { LABOR_FRED_SERIES } from "./laborFredSeedCatalog";
import { defaultEconomicCalendarRule } from "./releaseRule";
import type { ReleasePackageDef, ReleasePackageMemberRule } from "./releasePackageTypes";
import type { CalendarMatchSpec } from "./teEventMap";
import { mergedUsovFredMap } from "./usovFredMap";

function ecRule(granularity: DataGranularity) {
  return defaultEconomicCalendarRule(granularity);
}

function fredIdsFromCpi(
  filter: (fredId: string) => boolean,
): string[] {
  return CPI_FRED_SERIES.map((r) => r.fredId).filter(filter);
}

function fredIdsFromLabor(filter: (fredId: string) => boolean): string[] {
  return LABOR_FRED_SERIES.map((r) => r.fredId).filter(filter);
}

function usovCodesForFred(...fredIds: string[]): string[] {
  const want = new Set(fredIds);
  return Object.entries(mergedUsovFredMap())
    .filter(([, fred]) => want.has(fred))
    .map(([code]) => code);
}

function pkg(
  id: string,
  labelZh: string,
  opts: {
    labelEn?: string;
    countryCode?: string;
    agencyId?: string;
    granularity: DataGranularity;
    calendar: CalendarMatchSpec;
    sortOrder?: number;
    members: ReleasePackageMemberRule;
  },
): ReleasePackageDef {
  return {
    id,
    labelZh,
    labelEn: opts.labelEn,
    countryCode: opts.countryCode ?? "US",
    agencyId: opts.agencyId,
    granularity: opts.granularity,
    calendar: opts.calendar,
    release: ecRule(opts.granularity),
    sortOrder: opts.sortOrder ?? 0,
    members: opts.members,
  };
}

/**
 * 无固定发布日历的同源同频指标分组（probe_interval 型发布包）。
 *
 * 用于没有官方"某日宣布"式发布事件的日/周/季频市场数据（国债收益率、信用利差、
 * SLOOS 等）——按 FRED 官方 `Release:` 字段分组（同一份官方数据发布批次），
 * 仅用于管理端分组显示 + 「立即同步发布包」一键批量拉取；每个成员仍按自己的
 * `probe_interval` 规则独立调度（`parsePackageReleaseTemplate` 故意不识别此类
 * 模板，详见该函数注释），不会互相覆盖或改变现有拉取行为。
 */
function probePkg(
  id: string,
  labelZh: string,
  opts: {
    labelEn?: string;
    countryCode?: string;
    agencyId?: string;
    granularity: DataGranularity;
    intervalHours: number;
    sortOrder?: number;
    members: ReleasePackageMemberRule;
  },
): ReleasePackageDef {
  return {
    id,
    labelZh,
    labelEn: opts.labelEn,
    countryCode: opts.countryCode ?? "US",
    agencyId: opts.agencyId,
    granularity: opts.granularity,
    calendar: { countryCodes: [opts.countryCode ?? "US"], keywords: [] },
    release: { type: "probe_interval", intervalHours: opts.intervalHours },
    sortOrder: opts.sortOrder ?? 0,
    members: opts.members,
  };
}

const CPI_COMPONENT_FRED_IDS = fredIdsFromCpi(
  (id) =>
    id.startsWith("CUSR") ||
    id === "CPIENGSL" ||
    id === "CPIFABSL" ||
    id === "CPIMEDSL" ||
    id === "CPIAUCSL" ||
    id === "CPILFESL",
);

const EMPLOYMENT_FRED_IDS = fredIdsFromLabor(
  (id) =>
    id === "UNRATE" ||
    id === "U6RATE" ||
    id === "PAYEMS" ||
    id === "CIVPART" ||
    id === "LNS11300060" ||
    id === "CES0500000003" ||
    id === "UEMPMEAN" ||
    id === "AWHNONAG" ||
    id === "EMRATIO" ||
    id === "UNEMPLOY" ||
    id === "USPRIV" ||
    id === "USGOVT" ||
    id === "MANEMP" ||
    id === "AHETPI",
);

const JOLTS_FRED_IDS = ["JTSJOR", "JTSQUR", "JTSHIR", "JTSJOL"];

/** 内置美国发布包目录（seed → mds.release_package）
 *
 * **新指标日历**：只在本文件对应包的 `calendar` 字段维护关键词；
 * 勿在 `teEventMap.ts` 的 `TE_CALENDAR_BY_FRED` 新增项。
 */
export const RELEASE_PACKAGE_CATALOG: readonly ReleasePackageDef[] = [
  pkg("us.bls.cpi", "美国 CPI", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 10,
    calendar: {
      countryCodes: ["US"],
      keywords: [
        "consumer price index",
        "cpi m/m",
        "cpi (mom)",
        "cpi (mm)",
        "cpi s.a",
        "cpi",
      ],
      excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
    },
    members: {
      fredSeriesIds: CPI_COMPONENT_FRED_IDS,
      instrumentCodes: usovCodesForFred("CPIAUCSL", "CPILFESL"),
    },
  }),
  pkg("us.bls.employment_situation", "美国就业形势报告", {
    labelEn: "Employment Situation",
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 20,
    calendar: {
      countryCodes: ["US"],
      keywords: [
        "nonfarm payrolls",
        "non-farm payrolls",
        "non farm payrolls",
        "employment situation",
        "nfp",
      ],
      excludeKeywords: ["adp", "private payrolls only"],
    },
    members: {
      fredSeriesIds: EMPLOYMENT_FRED_IDS,
      instrumentCodes: usovCodesForFred("UNRATE", "PAYEMS"),
    },
  }),
  pkg("us.bls.jolts", "美国 JOLTS", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 30,
    calendar: {
      countryCodes: ["US"],
      keywords: ["jolts", "job openings"],
      excludeKeywords: ["y/y", "yoy"],
    },
    members: {
      fredSeriesIds: JOLTS_FRED_IDS,
      instrumentCodePatterns: ["sched_fred_JTS"],
    },
  }),
  pkg("us.dol.weekly_claims", "美国周度初请失业金", {
    granularity: "WEEKLY",
    sortOrder: 40,
    calendar: {
      countryCodes: ["US"],
      keywords: ["initial jobless claims", "jobless claims"],
      excludeKeywords: ["continuing"],
    },
    members: {
      fredSeriesIds: ["ICSA"],
    },
  }),
  pkg("us.dol.continuing_claims", "美国续请失业金", {
    granularity: "WEEKLY",
    sortOrder: 41,
    calendar: {
      countryCodes: ["US"],
      keywords: ["continuing jobless claims", "jobless claims"],
      excludeKeywords: ["initial"],
    },
    members: {
      fredSeriesIds: ["CCSA"],
    },
  }),
  pkg("us.bea.pce", "美国 PCE", {
    granularity: "MONTHLY",
    sortOrder: 50,
    calendar: {
      countryCodes: ["US"],
      keywords: ["pce price index", "personal consumption expenditure"],
      excludeKeywords: ["core", "income", "spending"],
    },
    members: {
      fredSeriesIds: ["PCEPI"],
      instrumentCodes: usovCodesForFred("PCEPI"),
    },
  }),
  pkg("us.bea.core_pce", "美国核心 PCE", {
    granularity: "MONTHLY",
    sortOrder: 51,
    calendar: {
      countryCodes: ["US"],
      keywords: ["core pce", "core pce price index"],
      excludeKeywords: ["income", "spending", "y/y", "yoy"],
    },
    members: {
      fredSeriesIds: ["PCEPILFE"],
      instrumentCodes: usovCodesForFred("PCEPILFE"),
    },
  }),
  pkg("us.bls.ppi", "美国 PPI", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 60,
    calendar: {
      countryCodes: ["US"],
      keywords: ["ppi", "producer price index"],
      excludeKeywords: ["y/y", "yoy"],
    },
    members: {
      fredSeriesIds: ["PPIFIS"],
    },
  }),
  pkg("us.bea.gdp", "美国 GDP", {
    granularity: "QUARTERLY",
    sortOrder: 70,
    calendar: {
      countryCodes: ["US"],
      keywords: ["gdp", "gross domestic product", "advance gdp"],
      excludeKeywords: ["prelim", "final", "q/q", "annualized"],
    },
    members: {
      // GDP 季报同时发布实际最终销售（FINSLC1）
      fredSeriesIds: ["GDP", "GDPC1", "A191RL1Q225SBEA", "FINSLC1"],
      instrumentCodes: usovCodesForFred("A191RL1Q225SBEA"),
    },
  }),
  pkg("us.bls.industrial_production", "美国工业生产", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 80,
    calendar: {
      countryCodes: ["US"],
      keywords: ["industrial production"],
      excludeKeywords: ["capacity"],
    },
    members: {
      // G.17 同日发布：总量 INDPRO + 制造业 NAICS IPMAN
      fredSeriesIds: ["INDPRO", "IPMAN"],
    },
  }),
  pkg("us.bls.retail_sales", "美国零售销售", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 90,
    calendar: {
      countryCodes: ["US"],
      keywords: ["retail sales"],
      excludeKeywords: ["core", "control"],
    },
    members: {
      fredSeriesIds: ["RSAFS"],
    },
  }),
  pkg("us.bls.housing_starts", "美国新屋开工", {
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 100,
    calendar: {
      countryCodes: ["US"],
      keywords: ["housing starts", "building permits"],
      excludeKeywords: ["existing"],
    },
    members: {
      // Census「New Residential Construction」一次发布：开工/许可/完工同日历事件
      fredSeriesIds: ["HOUST", "PERMIT", "HOUST1F", "COMPUTSA"],
    },
  }),
  pkg("us.census.new_home_sales", "美国新屋销售", {
    labelEn: "New Residential Sales",
    granularity: "MONTHLY",
    sortOrder: 101,
    calendar: {
      countryCodes: ["US"],
      keywords: ["new home sales"],
      excludeKeywords: ["existing", "pending"],
    },
    // Census 新屋销售报告同时发布可售月数（MSACSR）
    members: { fredSeriesIds: ["HSN1F", "MSACSR"] },
  }),
  pkg("us.nar.existing_home_sales", "美国成屋销售", {
    labelEn: "Existing Home Sales",
    granularity: "MONTHLY",
    sortOrder: 102,
    calendar: {
      countryCodes: ["US"],
      keywords: ["existing home sales"],
      excludeKeywords: ["new", "pending"],
    },
    members: { fredSeriesIds: ["EXHOSLUSM495S"] },
  }),
  pkg("us.fed.fomc", "美联储利率决议", {
    granularity: "MONTHLY",
    sortOrder: 110,
    calendar: {
      countryCodes: ["US"],
      keywords: [
        "fed interest rate",
        "fomc",
        "federal funds rate",
        "interest rate decision",
      ],
      excludeKeywords: ["minute", "speech", "testimony"],
    },
    members: {
      fredSeriesIds: ["FEDFUNDS", "DFEDTARU"],
      instrumentCodes: usovCodesForFred("DFEDTARU", "EFFR"),
    },
  }),
  pkg("us.fed.h41", "美联储 H.4.1 资产负债表", {
    granularity: "WEEKLY",
    sortOrder: 120,
    calendar: {
      countryCodes: ["US"],
      keywords: ["fed balance sheet", "fed's balance sheet", "fed total assets"],
    },
    members: {
      fredSeriesIds: ["WALCL", "TREAST", "WRESBAL", "WLRRAL", "WTREGEN"],
      instrumentCodes: usovCodesForFred("WALCL", "TREAST"),
    },
  }),
  pkg("us.ism.manufacturing", "美国 ISM 制造业 PMI", {
    granularity: "MONTHLY",
    sortOrder: 130,
    calendar: {
      countryCodes: ["US"],
      keywords: ["ism manufacturing pmi", "ism manufacturing index"],
      excludeKeywords: [
        "services",
        "non-manufacturing",
        "composite",
        "flash",
        "s&p",
        "global",
      ],
    },
    members: {
      fredSeriesIds: ["NAPM"],
      instrumentCodes: usovCodesForFred("NAPM"),
      instrumentCodePatterns: ["ism_us_ism_*"],
    },
  }),
  pkg("us.ism.services", "美国 ISM 服务业 PMI", {
    granularity: "MONTHLY",
    sortOrder: 131,
    calendar: {
      countryCodes: ["US"],
      keywords: [
        "ism services pmi",
        "non-manufacturing pmi",
        "non manufacturing pmi",
        "ism non manufacturing",
      ],
      excludeKeywords: ["ism manufacturing", "manufacturing index"],
    },
    members: {
      instrumentCodePatterns: ["ism_svc_us_svc_*"],
    },
  }),
  pkg("us.umich.sentiment", "密歇根消费者信心", {
    granularity: "MONTHLY",
    sortOrder: 140,
    calendar: {
      countryCodes: ["US"],
      keywords: ["michigan consumer sentiment", "consumer sentiment"],
    },
    members: {
      fredSeriesIds: ["UMCSENT"],
    },
  }),
  pkg("us.case_shiller", "Case-Shiller 房价指数", {
    granularity: "MONTHLY",
    sortOrder: 150,
    calendar: {
      countryCodes: ["US"],
      keywords: ["case-shiller", "s&p/case-shiller", "home price"],
    },
    members: {
      fredSeriesIds: ["CSUSHPINSA"],
    },
  }),
  pkg("us.fed.m2", "美国 M2 货币供应", {
    granularity: "MONTHLY",
    sortOrder: 160,
    calendar: {
      countryCodes: ["US"],
      keywords: ["m2 money supply"],
    },
    members: {
      fredSeriesIds: ["M2SL"],
    },
  }),

  // --- 以下为 probe_interval 型分组（无官方发布日历，按 FRED Release: 字段分组） ---
  probePkg("us.frb.h15_rates", "美国 H.15 精选利率", {
    labelEn: "H.15 Selected Interest Rates",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 200,
    members: { fredSeriesIds: ["DGS2", "DFII10", "DGS10"] },
  }),
  probePkg("us.frb.interest_rate_spreads", "美国利差（FRED 计算）", {
    labelEn: "Interest Rate Spreads",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 201,
    members: { fredSeriesIds: ["T10YIE", "T10Y3M"] },
  }),
  probePkg("us.ice.bofa_indices", "ICE BofA 债券利差指数", {
    labelEn: "ICE BofA Indices",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 202,
    members: { fredSeriesIds: ["BAMLH0A0HYM2", "BAMLC0A0CM"] },
  }),
  probePkg("us.frb.chargeoff_delinquency", "美国银行核销与拖欠率", {
    labelEn: "Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks",
    granularity: "QUARTERLY",
    intervalHours: 168,
    sortOrder: 203,
    // DRSFRMACBS（单户抵押贷款拖欠率）与信用卡/工商拖欠率同属 Fed 同一发布
    members: { fredSeriesIds: ["DRCCLACBS", "DRBLACBS", "DRSFRMACBS"] },
  }),
  probePkg("us.nyfed.effr", "纽约联储：有效联邦基金利率", {
    labelEn: "Federal Funds Data",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 204,
    members: { fredSeriesIds: ["EFFR"] },
  }),
  probePkg("us.nyfed.rrp", "纽约联储：隔夜逆回购", {
    labelEn: "Temporary Open Market Operations",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 205,
    members: { fredSeriesIds: ["RRPONTSYD", "RRPONTSYAWARD"] },
  }),
  probePkg("us.nyfed.sofr", "纽约联储：SOFR", {
    labelEn: "Secured Overnight Financing Rate Data",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 212,
    members: { fredSeriesIds: ["SOFR"] },
  }),
  probePkg("us.fed.iorb", "美联储：准备金利率（IORB）", {
    labelEn: "Interest Rate on Reserve Balances",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 213,
    members: { fredSeriesIds: ["IORB"] },
  }),
  probePkg("us.chicagofed.nfci", "芝加哥联储金融条件指数", {
    labelEn: "Chicago Fed National Financial Conditions Index",
    granularity: "WEEKLY",
    intervalHours: 24,
    sortOrder: 206,
    members: { fredSeriesIds: ["NFCI"] },
  }),
  probePkg("us.frb.sloos", "美联储高级信贷官意见调查（SLOOS）", {
    labelEn: "Senior Loan Officer Opinion Survey on Bank Lending Practices",
    granularity: "QUARTERLY",
    intervalHours: 168,
    sortOrder: 207,
    members: { fredSeriesIds: ["DRTSCILM"] },
  }),
  probePkg("us.frb.h8_bank_assets", "美国 H.8 商业银行资产负债", {
    labelEn: "H.8 Assets and Liabilities of Commercial Banks in the United States",
    granularity: "MONTHLY",
    intervalHours: 72,
    sortOrder: 208,
    members: { fredSeriesIds: ["BUSLOANS"] },
  }),
  probePkg("us.freddiemac.pmms", "Freddie Mac 抵押利率（PMMS）", {
    labelEn: "Primary Mortgage Market Survey",
    granularity: "WEEKLY",
    intervalHours: 24,
    sortOrder: 210,
    members: { fredSeriesIds: ["MORTGAGE30US", "MORTGAGE15US"] },
  }),
  probePkg("us.census.homeownership", "美国自有住房率", {
    labelEn: "Housing Vacancies and Homeownership",
    granularity: "QUARTERLY",
    intervalHours: 168,
    sortOrder: 211,
    members: { fredSeriesIds: ["RHORUSQ156N"] },
  }),
  probePkg("us.treasury.mts", "美国财政部 MTS 月报", {
    labelEn: "Monthly Treasury Statement",
    granularity: "MONTHLY",
    intervalHours: 72,
    sortOrder: 214,
    members: {
      instrumentCodes: [
        "treasury_mts_m01_receipts",
        "treasury_mts_m01_outlays",
        "treasury_mts_m01_deficit",
        "treasury_mts_m01_receipts_fytd",
        "treasury_mts_m01_outlays_fytd",
        "treasury_mts_m01_deficit_fytd",
        "treasury_mts_m09_rcpt_individual",
        "treasury_mts_m09_rcpt_corporate",
        "treasury_mts_m09_rcpt_payroll",
        "treasury_mts_m09_rcpt_excise",
        "treasury_mts_m09_outlay_interest",
        "treasury_mts_m09_outlay_defense",
        "treasury_mts_m09_outlay_social_security",
        "treasury_mts_m09_outlay_medicare",
        "treasury_mts_m09_mandatory_proxy",
        "treasury_mts_m09_discretionary_proxy",
        "fiscal_individual_tax_share_receipts",
        "fiscal_net_interest_share_outlays",
        "fiscal_ss_medicare_share_outlays",
      ],
    },
  }),
  probePkg("us.treasury.dts", "美国财政部 DTS 日频现金", {
    labelEn: "Daily Treasury Statement",
    granularity: "DAILY",
    intervalHours: 24,
    sortOrder: 215,
    members: {
      instrumentCodes: ["treasury_dts_tga_balance", "treasury_dts_daily_net_cash"],
    },
  }),
  probePkg("us.treasury.debt", "美国公共债务（Debt to the Penny）", {
    labelEn: "Debt to the Penny",
    granularity: "WEEKLY",
    intervalHours: 24,
    sortOrder: 216,
    members: { instrumentCodes: ["treasury_debt_penny_net_weekly"] },
  }),
  probePkg("us.treasury.debt_levels", "美国联邦债务存量（季）", {
    labelEn: "Treasury Bulletin Debt",
    granularity: "QUARTERLY",
    intervalHours: 168,
    sortOrder: 217,
    members: { fredSeriesIds: ["GFDEBTN", "FYGFDPUN", "GFDEGDQ188S"] },
  }),
  probePkg("us.omb.fiscal_ratios", "美国 OMB 财政/GDP 比率", {
    labelEn: "Debt to Gross Domestic Product Ratios",
    granularity: "ANNUAL",
    intervalHours: 168,
    sortOrder: 218,
    members: {
      fredSeriesIds: [
        "FYFSGDA188S",
        "FYOIGDA188S",
        "GFDGDPA188S",
        "FYFRGDA188S",
        "FYONGDA188S",
        "FYGFGDQ188S",
        "GFDEGDQ188S",
      ],
      instrumentCodes: ["fiscal_primary_deficit_gdp", "fiscal_interest_share_outlays_annual"],
    },
  }),
  pkg("us.bea.personal_income", "美国个人收入与支出", {
    labelEn: "Personal Income and Outlays",
    granularity: "MONTHLY",
    sortOrder: 220,
    calendar: {
      countryCodes: ["US"],
      keywords: ["personal income"],
      excludeKeywords: ["spending only"],
    },
    members: { fredSeriesIds: ["W875RX1", "DSPIC96"] },
  }),
  probePkg("us.stlouisfed.recession_prob", "美国平滑衰退概率", {
    labelEn: "Smoothed U.S. Recession Probabilities",
    granularity: "MONTHLY",
    intervalHours: 168,
    sortOrder: 221,
    members: { fredSeriesIds: ["RECPROUSM156N"] },
  }),
  probePkg("us.stlouisfed.sahm", "美国 Sahm 规则", {
    labelEn: "Sahm Rule Recession Indicator (Real-time)",
    granularity: "MONTHLY",
    intervalHours: 168,
    sortOrder: 222,
    members: { fredSeriesIds: ["SAHMREALTIME"] },
  }),
  probePkg("us.census.mfg_trade_sales", "美国实际制造与贸易销售", {
    labelEn: "Real Manufacturing and Trade Industries Sales",
    granularity: "MONTHLY",
    intervalHours: 72,
    sortOrder: 223,
    members: { fredSeriesIds: ["CMRMTSPL"] },
  }),
  probePkg("us.chicagofed.cfnai", "芝加哥联储全国活动指数", {
    labelEn: "Chicago Fed National Activity Index",
    granularity: "MONTHLY",
    intervalHours: 72,
    sortOrder: 224,
    members: { fredSeriesIds: ["CFNAI"] },
  }),
  probePkg("us.nber.recession", "NBER 衰退标记", {
    labelEn: "NBER Recession Indicators",
    granularity: "MONTHLY",
    intervalHours: 168,
    sortOrder: 225,
    members: { fredSeriesIds: ["USREC"] },
  }),
  pkg("us.census.m3", "美国制造商订单与库存（M3）", {
    labelEn: "Manufacturer's Shipments, Inventories, and Orders (M3)",
    granularity: "MONTHLY",
    sortOrder: 226,
    calendar: {
      countryCodes: ["US"],
      keywords: ["durable goods", "factory orders"],
      excludeKeywords: ["wholesale", "retail", "inventories to sales"],
    },
    members: {
      fredSeriesIds: ["DGORDER", "ADXTNO", "NEWORDER", "AMDMUO", "AMTMTI"],
    },
  }),
  pkg("us.census.mtis", "美国制造与贸易库存销售（MTIS）", {
    labelEn: "Manufacturing and Trade Inventories and Sales",
    granularity: "MONTHLY",
    sortOrder: 227,
    calendar: {
      countryCodes: ["US"],
      keywords: ["business inventories", "inventory sales"],
      excludeKeywords: ["durable goods", "factory orders"],
    },
    members: {
      fredSeriesIds: ["BUSINV", "ISRATIO", "MNFCTRIRSA"],
    },
  }),
  pkg("us.frb.g17_capacity", "美国产能利用率（G.17）", {
    labelEn: "G.17 Capacity Utilization",
    agencyId: "us-bls",
    granularity: "MONTHLY",
    sortOrder: 228,
    calendar: {
      countryCodes: ["US"],
      keywords: ["capacity utilization"],
      excludeKeywords: ["industrial production"],
    },
    members: { fredSeriesIds: ["MCUMFN"] },
  }),
] as const;

export function instrumentMatchesPackageMember(
  inst: { code: string; fredSeriesId: string | null },
  rule: ReleasePackageMemberRule,
): boolean {
  const fred = inst.fredSeriesId?.toUpperCase() ?? "";
  if (rule.fredSeriesIds?.some((id) => id.toUpperCase() === fred)) return true;
  if (rule.instrumentCodes?.includes(inst.code)) return true;
  for (const pat of rule.instrumentCodePatterns ?? []) {
    if (pat.endsWith("*")) {
      if (inst.code.startsWith(pat.slice(0, -1))) return true;
    } else if (inst.code === pat || inst.code.startsWith(`${pat}_`)) {
      return true;
    }
  }
  return false;
}

export function findPackageForInstrument(
  inst: { code: string; fredSeriesId: string | null },
  catalog: readonly ReleasePackageDef[] = RELEASE_PACKAGE_CATALOG,
): ReleasePackageDef | null {
  for (const def of catalog) {
    if (instrumentMatchesPackageMember(inst, def.members)) return def;
  }
  return null;
}

/** 从发布包目录生成 FRED series_id → 日历规则（包级配置优先于 teEventMap 遗留表） */
export function buildFredCalendarMapFromPackages(
  catalog: readonly ReleasePackageDef[] = RELEASE_PACKAGE_CATALOG,
): Record<string, CalendarMatchSpec> {
  const map: Record<string, CalendarMatchSpec> = {};
  for (const def of catalog) {
    for (const fredId of def.members.fredSeriesIds ?? []) {
      map[fredId.toUpperCase()] = def.calendar;
    }
  }
  return map;
}

/** 按仪器代码 / FRED ID 解析发布包日历（新指标应只维护 releasePackageCatalog） */
export function calendarSpecForInstrument(
  inst: { code: string; fredSeriesId: string | null },
  catalog: readonly ReleasePackageDef[] = RELEASE_PACKAGE_CATALOG,
): CalendarMatchSpec | null {
  return findPackageForInstrument(inst, catalog)?.calendar ?? null;
}

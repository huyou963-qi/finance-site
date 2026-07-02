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
      fredSeriesIds: ["GDP", "GDPC1", "A191RL1Q225SBEA"],
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
      fredSeriesIds: ["INDPRO"],
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
      fredSeriesIds: ["HOUST"],
    },
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
      fredSeriesIds: ["WALCL", "TREAST"],
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

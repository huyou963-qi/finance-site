import fs from "node:fs";
import path from "node:path";
import type { EconomicCalendarEvent } from "./economicCalendar/types";
import { teCountrySlugsForCodes } from "./tradingEconomicsCalendar/countries";
import { applyFredOverridesToMap, getCachedFredCalendarOverrides } from "./calendarOverrideCache";
import { PROBE_ONLY_FRED_SERIES } from "./probeOnlySeries";
import {
  buildFredCalendarMapFromPackages,
  calendarSpecForInstrument,
} from "./releasePackageCatalog";

/** 匹配 TradingEconomics 日历事件：关键词 + 国家 + 可选排除词 */
export type CalendarMatchSpec = {
  countryCodes: string[];
  keywords: string[];
  excludeKeywords?: string[];
  /** 固定 event_attr_id（若已知） */
  eventId?: string;
};

/** FRED series_id / 仪器 code → 日历匹配规则
 * @deprecated 新指标请只在 releasePackageCatalog.ts 维护发布包 calendar；
 * 此表仅作未挂发布包订阅的遗留 fallback，运行时以 buildFredCalendarMapFromPackages() 为准覆盖同键项。
 */
export const TE_CALENDAR_BY_FRED: Record<string, CalendarMatchSpec> = {
  CPIAUCSL: {
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
  CPILFESL: {
    countryCodes: ["US"],
    keywords: ["core cpi", "core consumer price", "cpi s.a", "cpi"],
    excludeKeywords: ["y/y", "yoy"],
  },
  UNRATE: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "u.s. unemployment"],
    excludeKeywords: ["claims", "jobless"],
  },
  U6RATE: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "u.s. unemployment"],
    excludeKeywords: ["claims", "jobless"],
  },
  PAYEMS: {
    countryCodes: ["US"],
    keywords: ["nonfarm payrolls", "non-farm payrolls", "non farm payrolls", "nfp"],
    excludeKeywords: ["adp", "private"],
  },
  CIVPART: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "nonfarm payrolls", "non-farm payrolls"],
    excludeKeywords: ["claims", "jobless", "adp"],
  },
  LNS11300060: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "nonfarm payrolls", "non-farm payrolls"],
    excludeKeywords: ["claims", "jobless", "adp"],
  },
  UEMPMEAN: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "nonfarm payrolls"],
    excludeKeywords: ["claims", "jobless", "adp"],
  },
  AWHNONAG: {
    countryCodes: ["US"],
    keywords: ["average hourly earnings", "nonfarm payrolls"],
    excludeKeywords: ["y/y"],
  },
  JTSJOR: {
    countryCodes: ["US"],
    keywords: ["jolts", "job openings"],
    excludeKeywords: ["y/y", "yoy"],
  },
  JTSQUR: {
    countryCodes: ["US"],
    keywords: ["jolts", "quits"],
    excludeKeywords: ["y/y", "yoy"],
  },
  JTSHIR: {
    countryCodes: ["US"],
    keywords: ["jolts", "hires"],
    excludeKeywords: ["y/y", "yoy"],
  },
  JTSJOL: {
    countryCodes: ["US"],
    keywords: ["jolts", "job openings"],
    excludeKeywords: ["y/y", "yoy"],
  },
  ICSA: {
    countryCodes: ["US"],
    keywords: ["initial jobless claims", "jobless claims"],
    excludeKeywords: ["continuing"],
  },
  CCSA: {
    countryCodes: ["US"],
    keywords: ["continuing jobless claims", "jobless claims"],
    excludeKeywords: ["initial"],
  },
  EMRATIO: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "nonfarm payrolls"],
    excludeKeywords: ["claims", "jobless", "adp"],
  },
  UNEMPLOY: {
    countryCodes: ["US"],
    keywords: ["unemployment rate", "nonfarm payrolls"],
    excludeKeywords: ["claims", "jobless", "adp"],
  },
  USPRIV: {
    countryCodes: ["US"],
    keywords: ["nonfarm payrolls", "non-farm payrolls", "private payrolls"],
    excludeKeywords: ["adp"],
  },
  USGOVT: {
    countryCodes: ["US"],
    keywords: ["nonfarm payrolls", "non-farm payrolls"],
    excludeKeywords: ["adp", "private"],
  },
  MANEMP: {
    countryCodes: ["US"],
    keywords: ["nonfarm payrolls", "manufacturing payrolls"],
    excludeKeywords: ["adp"],
  },
  GDPC1: {
    countryCodes: ["US"],
    keywords: ["gdp", "gross domestic product"],
    excludeKeywords: ["prelim", "advance", "final", "q/q", "annualized"],
  },
  FEDFUNDS: {
    countryCodes: ["US"],
    keywords: ["fed interest rate", "fomc", "federal funds rate", "interest rate decision"],
    excludeKeywords: ["minute", "speech", "testimony"],
  },
  INDPRO: {
    countryCodes: ["US"],
    keywords: ["industrial production"],
    excludeKeywords: ["capacity"],
  },
  PCEPI: {
    countryCodes: ["US"],
    keywords: ["pce price index", "personal consumption expenditure"],
    excludeKeywords: ["core", "income", "spending"],
  },
  PCEPILFE: {
    countryCodes: ["US"],
    keywords: ["core pce"],
  },
  RSAFS: {
    countryCodes: ["US"],
    keywords: ["retail sales"],
    excludeKeywords: ["core", "control"],
  },
  M2SL: {
    countryCodes: ["US"],
    keywords: ["m2 money supply"],
  },
  WALCL: {
    countryCodes: ["US"],
    keywords: ["fed balance sheet", "fed's balance sheet", "fed total assets"],
  },
  GS2: {
    countryCodes: ["US"],
    keywords: ["2-year note auction", "2 year note auction"],
    excludeKeywords: ["10-year", "30-year"],
  },
  BAMLH0A0HYM2: {
    countryCodes: ["US"],
    keywords: ["high yield", "junk bond"],
  },
  HOUST: {
    countryCodes: ["US"],
    keywords: ["housing starts", "building permits"],
    excludeKeywords: ["existing"],
  },
  UMCSENT: {
    countryCodes: ["US"],
    keywords: ["michigan consumer sentiment", "consumer sentiment"],
  },
  A191RL1Q225SBEA: {
    countryCodes: ["US"],
    keywords: ["gdp", "gross domestic product", "advance gdp"],
    excludeKeywords: ["prelim", "final"],
  },
  GDP: {
    countryCodes: ["US"],
    keywords: ["gdp", "gross domestic product"],
    excludeKeywords: ["advance", "prelim"],
  },
  GS10: {
    countryCodes: ["US"],
    keywords: ["10-year note auction", "10 year note auction"],
    excludeKeywords: ["2-year", "30-year", "5-year"],
  },
  DCOILWTICO: {
    countryCodes: ["US"],
    keywords: ["crude oil inventories", "eia crude"],
  },
  CPIENGSL: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CPIFABSL: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SAH1: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHA: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHC: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SACL1E: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SASLE: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SETA02: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SETA01: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CPIMEDSL: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  // —— CPI 分项环比表（BLS Table A）新增分项：与 CPI 主报同刻发布 ——
  CPIUFDSL: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SAF11: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEFV: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SACE: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SETB01: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHE: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHF: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHF01: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SEHF02: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CPIAPPSL: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SAM1: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SAS4: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  CUSR0000SAM2: {
    countryCodes: ["US"],
    keywords: ["consumer price index", "cpi m/m", "cpi (mom)", "cpi (mm)"],
    excludeKeywords: ["core", "y/y", "yoy", "ppi", "wage"],
  },
  PPIFIS: {
    countryCodes: ["US"],
    keywords: ["ppi", "producer price index"],
    excludeKeywords: ["y/y", "yoy"],
  },
  CES0500000003: {
    countryCodes: ["US"],
    keywords: ["average hourly earnings", "hourly earnings"],
    excludeKeywords: ["y/y"],
  },
};

/** @deprecated 使用 releasePackageCatalog 中 us.ism.manufacturing 的 calendar */
export const TE_CALENDAR_ISM_MANUFACTURING: CalendarMatchSpec = {
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
};

/** @deprecated 使用 releasePackageCatalog 中 us.ism.services 的 calendar */
export const TE_CALENDAR_ISM_SERVICES: CalendarMatchSpec = {
  countryCodes: ["US"],
  keywords: [
    "ism services pmi",
    "non-manufacturing pmi",
    "non manufacturing pmi",
    "ism non manufacturing",
  ],
  excludeKeywords: ["ism manufacturing", "manufacturing index"],
};

const OVERRIDES_FILE = path.join(process.cwd(), ".data", "te-calendar-mapping-overrides.json");
const LEGACY_OVERRIDES_FILE = path.join(process.cwd(), ".data", "calendar-mapping-overrides.json");

/** 合并遗留 FRED 表、发布包目录与日历覆盖（DB 缓存优先，无缓存时读 `.data` 文件） */
export function mergedTeCalendarByFred(): Record<string, CalendarMatchSpec> {
  const fromPackages = buildFredCalendarMapFromPackages();
  let merged: Record<string, CalendarMatchSpec> = { ...TE_CALENDAR_BY_FRED, ...fromPackages };
  merged = applyFredOverridesToMap(merged);
  if (Object.keys(getCachedFredCalendarOverrides()).length > 0) {
    return merged;
  }
  try {
    const raw = fs.readFileSync(OVERRIDES_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, CalendarMatchSpec & { updatedAt?: string }>;
    for (const [key, spec] of Object.entries(parsed)) {
      if (!spec?.keywords?.length) continue;
      merged[key] = {
        countryCodes: spec.countryCodes ?? [],
        keywords: spec.keywords,
        excludeKeywords: spec.excludeKeywords,
        eventId: spec.eventId,
      };
    }
  } catch {
    try {
      const raw = fs.readFileSync(LEGACY_OVERRIDES_FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, CalendarMatchSpec & { updatedAt?: string }>;
      for (const [key, spec] of Object.entries(parsed)) {
        if (!spec?.keywords?.length) continue;
        merged[key] = {
          countryCodes: spec.countryCodes ?? [],
          keywords: spec.keywords,
          excludeKeywords: spec.excludeKeywords,
          eventId: spec.eventId,
        };
      }
    } catch {
      // 无 overrides 文件
    }
  }
  return merged;
}

/** 无可靠日历发布时刻的 FRED 序列（日频市场数据等）；定义移至 probeOnlySeries.ts 以打破循环依赖 */
export { PROBE_ONLY_FRED_SERIES } from "./probeOnlySeries";

/** 是否应参与 economic_calendar 同步 */
export function subscriptionUsesCalendarSync(
  sourceSeriesKey: string,
  instrumentCode: string,
): boolean {
  if (PROBE_ONLY_FRED_SERIES.has(sourceSeriesKey)) return false;
  const m = instrumentCode.match(/^sched_fred_(.+)$/);
  if (m?.[1] && PROBE_ONLY_FRED_SERIES.has(m[1])) return false;
  const spec = calendarSpecForSubscription(sourceSeriesKey, instrumentCode);
  return Boolean(spec && spec.keywords.length > 0);
}

/** sched_fred_* / usov_* code 后缀映射；优先 releasePackageCatalog */
export function calendarSpecForSubscription(
  sourceSeriesKey: string,
  instrumentCode: string,
): CalendarMatchSpec | null {
  const fromPackage = calendarSpecForInstrument({
    code: instrumentCode,
    fredSeriesId: sourceSeriesKey,
  });
  if (fromPackage) return fromPackage;

  const map = mergedTeCalendarByFred();
  const fred = map[sourceSeriesKey];
  if (fred) return fred;

  const m = instrumentCode.match(/^sched_fred_(.+)$/);
  if (m?.[1] && map[m[1]]) {
    return map[m[1]];
  }

  const usov = instrumentCode.match(/^usov_.+_(.+)$/);
  if (usov?.[1]) {
    const tail = usov[1];
    if (tail.includes("cpi")) {
      return map.CPIAUCSL ?? null;
    }
    if (tail.includes("unrate") || tail.includes("unemployment")) {
      return map.UNRATE ?? null;
    }
    if (tail.includes("nfp")) {
      return map.PAYEMS ?? null;
    }
  }

  return null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchesSpec(event: EconomicCalendarEvent, spec: CalendarMatchSpec): boolean {
  if (spec.eventId && event.eventId !== spec.eventId) return false;

  if (spec.countryCodes.length > 0) {
    const cc = event.countryCode?.toUpperCase();
    if (!cc || !spec.countryCodes.map((c) => c.toUpperCase()).includes(cc)) {
      return false;
    }
  }

  const title = norm(event.title);
  if (spec.keywords.length === 0) return false;

  const hit = spec.keywords.some((kw) => title.includes(norm(kw)));
  if (!hit) return false;

  if (spec.excludeKeywords?.length) {
    const excluded = spec.excludeKeywords.some((kw) => title.includes(norm(kw)));
    if (excluded) return false;
  }

  return true;
}

/** 在事件列表中找该指标下一次发布时间（>= from） */
export function findNextCalendarRelease(
  events: EconomicCalendarEvent[],
  spec: CalendarMatchSpec,
  from: Date = new Date(),
): EconomicCalendarEvent | null {
  const fromMs = from.getTime();
  const candidates = events
    .filter((e) => e.releaseAt.getTime() >= fromMs - 60_000 && matchesSpec(e, spec))
    .sort((a, b) => a.releaseAt.getTime() - b.releaseAt.getTime());

  return candidates[0] ?? null;
}

export function teCountryCodesForSpec(spec: CalendarMatchSpec): string[] {
  return teCountrySlugsForCodes(spec.countryCodes).length
    ? spec.countryCodes.map((c) => c.toUpperCase())
    : spec.countryCodes;
}

export function collectCountryCodesFromSubscriptions(
  subs: { sourceSeriesKey: string; instrument: { code: string } }[],
): string[] {
  const codes = new Set<string>();
  for (const s of subs) {
    if (!subscriptionUsesCalendarSync(s.sourceSeriesKey, s.instrument.code)) continue;
    const spec = calendarSpecForSubscription(s.sourceSeriesKey, s.instrument.code);
    if (spec) teCountryCodesForSpec(spec).forEach((c) => codes.add(c));
  }
  return [...codes];
}

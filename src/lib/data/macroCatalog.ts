/** 左侧目录：常见经济体（世界银行 API 使用 ISO 3166-1 alpha-2） */

import {
  fredDisplayLabel,
  macroCountryName,
  serializeUnifiedKeysForAllowlist,
  type UnifiedCatalogGroup,
  type UnifiedCatalogItem,
  worldBankIndicatorLabel,
} from "./fredCatalog";
import { CHINA_OVERVIEW_BY_CODE } from "./chinaOverviewLayout";
import { JAPAN_OVERVIEW_BY_CODE } from "./japanOverviewLayout";
import { US_OVERVIEW_BY_CODE } from "./usOverviewLayout";

export type { UnifiedCatalogItem, UnifiedCatalogGroup } from "./fredCatalog";
export type { UnifiedCatalogCountry } from "./fredCatalog";

export type MacroCountry = { code: string; name: string };

export type MacroIndicator = {
  id: string;
  /** 完整图例名 */
  label: string;
  /** 侧边栏简短名 */
  shortLabel: string;
};

export const MACRO_COUNTRIES: MacroCountry[] = [
  { code: "US", name: "美国" },
  { code: "CN", name: "中国" },
  { code: "JP", name: "日本" },
  { code: "DE", name: "德国" },
  { code: "GB", name: "英国" },
  { code: "FR", name: "法国" },
  { code: "IN", name: "印度" },
  { code: "BR", name: "巴西" },
  { code: "KR", name: "韩国" },
  { code: "RU", name: "俄罗斯" },
  { code: "IT", name: "意大利" },
  { code: "CA", name: "加拿大" },
  { code: "AU", name: "澳大利亚" },
  { code: "ES", name: "西班牙" },
  { code: "MX", name: "墨西哥" },
];

/** 常用宏观指标（世界银行 indicator id） */
export const MACRO_INDICATORS: MacroIndicator[] = [
  {
    id: "FP.CPI.TOTL.ZG",
    label: "CPI 通胀（年 %）",
    shortLabel: "CPI 通胀",
  },
  {
    id: "NY.GDP.MKTP.KD.ZG",
    label: "GDP 总量增速（年 %）",
    shortLabel: "GDP 增速",
  },
  {
    id: "SL.UEM.TOTL.ZS",
    label: "失业率（占总劳动力 %）",
    shortLabel: "失业率",
  },
  {
    id: "NE.TRD.GNFS.ZS",
    label: "商品与服务贸易额 / GDP（%）",
    shortLabel: "贸易/GDP",
  },
  {
    id: "BX.KLT.DINV.WD.GD.ZS",
    label: "外商直接投资净流入 / GDP（%）",
    shortLabel: "FDI/GDP",
  },
  {
    id: "NY.GDP.PCAP.KD.ZG",
    label: "人均 GDP 增速（年 %）",
    shortLabel: "人均 GDP 增速",
  },
  {
    id: "GC.DOD.TOTL.GD.ZS",
    label: "中央政府债务 / GDP（%）",
    shortLabel: "政府债务/GDP",
  },
  {
    id: "SP.POP.GROW",
    label: "人口增速（年 %）",
    shortLabel: "人口增速",
  },
];

/** 美联储 FRED 常用序列（series_id），需在服务端配置 FRED_API_KEY */
export type FredSeriesOption = { id: string; name: string };

export const FRED_SERIES_OPTIONS: FredSeriesOption[] = [
  { id: "CPIAUCSL", name: "美国 CPI 全部商品（指数，季调）" },
  { id: "CPILFESL", name: "美国核心 CPI（剔除食品和能源）" },
  { id: "UNRATE", name: "美国失业率（%）" },
  { id: "PAYEMS", name: "美国非农就业人数（千人）" },
  { id: "FEDFUNDS", name: "联邦基金有效利率（%）" },
  { id: "GS10", name: "10 年期国债收益率（%）" },
  { id: "GS2", name: "2 年期国债收益率（%）" },
  { id: "T10Y2Y", name: "10 年减 2 年利差（%）" },
  { id: "GDP", name: "名义 GDP（十亿美元）" },
  { id: "GDPC1", name: "实际 GDP（十亿美元，链式加权）" },
  { id: "M2SL", name: "M2 货币供应量（十亿美元）" },
  { id: "DEXUSEU", name: "美元/欧元汇率" },
  { id: "DTWEXBGS", name: "美元名义广义指数" },
  { id: "INDPRO", name: "工业生产指数（2017=100）" },
  { id: "HOUST", name: "新屋开工（年化套数）" },
  { id: "PCEC96", name: "实际个人消费支出（十亿美元）" },
  { id: "RRSFS", name: "零售销售（百万美元）" },
  { id: "VIXCLS", name: "VIX 波动率指数" },
];

export const FRED_ALLOWED_IDS = new Set(FRED_SERIES_OPTIONS.map((x) => x.id));

export const MACRO_MAX_FRED_SERIES = 12;

export const DEFAULT_FRED_SERIES_IDS: string[] = ["CPIAUCSL", "UNRATE"];

export function fredSeriesLabel(id: string): string {
  return FRED_SERIES_OPTIONS.find((x) => x.id === id)?.name ?? id;
}

export function parseFredSeriesQuery(raw: string | null): string[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return [...DEFAULT_FRED_SERIES_IDS];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const id = part.trim().toUpperCase();
    if (!id || !FRED_ALLOWED_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out.length > 0 ? out : [...DEFAULT_FRED_SERIES_IDS];
}

export function serializeFredSeriesIds(ids: string[]): string {
  return [
    ...new Set(
      ids
        .map((id) => id.trim().toUpperCase())
        .filter((id) => FRED_ALLOWED_IDS.has(id)),
    ),
  ].join(",");
}

/** 世界银行响应里的 countryiso3code */
export const ISO2_TO_ISO3: Record<string, string> = {
  US: "USA",
  CN: "CHN",
  JP: "JPN",
  DE: "DEU",
  GB: "GBR",
  FR: "FRA",
  IN: "IND",
  BR: "BRA",
  KR: "KOR",
  RU: "RUS",
  IT: "ITA",
  CA: "CAN",
  AU: "AUS",
  ES: "ESP",
  MX: "MEX",
};

export const MACRO_MAX_SERIES = 60;

export type MacroSelection = { country: string; indicator: string };

const ALLOWED_COUNTRY = new Set(MACRO_COUNTRIES.map((c) => c.code));
const ALLOWED_INDICATOR = new Set(MACRO_INDICATORS.map((i) => i.id));

export const DEFAULT_WORLD_BANK_SELECTIONS: MacroSelection[] = [
  { country: "US", indicator: "FP.CPI.TOTL.ZG" },
  { country: "CN", indicator: "FP.CPI.TOTL.ZG" },
];

export function selectionKey(country: string, indicator: string): string {
  return `${country.toUpperCase()}:${indicator}`;
}

export function parseSelectionKey(key: string): MacroSelection | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const country = key.slice(0, idx).trim().toUpperCase();
  const indicator = key.slice(idx + 1).trim();
  if (!country || !indicator) return null;
  return { country, indicator };
}

export function serializeSeriesKeys(selections: MacroSelection[]): string {
  return selections.map((s) => selectionKey(s.country, s.indicator)).join(",");
}

export function parseSeriesQuery(raw: string | null): MacroSelection[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return [...DEFAULT_WORLD_BANK_SELECTIONS];

  const seen = new Set<string>();
  const out: MacroSelection[] = [];

  for (const part of trimmed.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf(":");
    if (idx <= 0) continue;
    const country = p.slice(0, idx).trim().toUpperCase();
    const indicator = p.slice(idx + 1).trim();
    if (!ALLOWED_COUNTRY.has(country) || !ALLOWED_INDICATOR.has(indicator)) continue;
    const key = selectionKey(country, indicator);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ country, indicator });
  }

  return out.length > 0 ? out : [...DEFAULT_WORLD_BANK_SELECTIONS];
}

export function countryName(code: string): string {
  return MACRO_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

export function indicatorLabel(indicatorId: string): string {
  return MACRO_INDICATORS.find((i) => i.id === indicatorId)?.label ?? indicatorId;
}

// —— 统一宏观（FRED；目录见 `fredCatalog` + `/api/data/fmp-catalog`）——

export const DEFAULT_UNIFIED_SERIES_KEYS: string[] = [
  "fred:GDPC1",
  "fred:CPIAUCSL",
  "fred:UNRATE",
];

const FRED_SERIES_KEY_RE = /^fred:[A-Z0-9._-]{1,40}$/;

/** 兼容旧调用：无 allowlist 时仅按 fred: 键格式去重（服务端应以 catalog allowlist 为准） */
export function getUnifiedCatalogGroups() {
  const cat: UnifiedCatalogItem[] = [
    {
      key: "fred:GDPC1",
      label: "美国实际 GDP（季调，十亿美元）",
      frequency: "季度",
      provider: "fred",
      countryCode: "US",
      categoryName: "国民经济核算",
    },
    {
      key: "fred:CPIAUCSL",
      label: "CPI（全部城市消费者）",
      frequency: "月",
      provider: "fred",
      countryCode: "US",
      categoryName: "价格指数",
    },
    {
      key: "fred:UNRATE",
      label: "失业率（%）",
      frequency: "月",
      provider: "fred",
      countryCode: "US",
      categoryName: "就业与工资",
    },
  ];
  const groups: UnifiedCatalogGroup[] = [{ name: "核心指标", items: cat }];
  return groups;
}

/** 图例与工具提示用显示名 */
export function unifiedSeriesDisplayName(key: string): string {
  if (key.startsWith("fred:")) {
    const name = key.slice(4);
    return `美国 · ${fredDisplayLabel(name)}`;
  }
  if (key.startsWith("wb:")) {
    const parts = key.split(":");
    if (parts.length >= 3) {
      const country = parts[1]?.toUpperCase() ?? "";
      const indicatorId = parts.slice(2).join(":");
        return `${macroCountryName(country)} · ${worldBankIndicatorLabel(indicatorId)}`;
    }
  }
  if (key.startsWith("mds:debtcap_")) {
    const raw = key.slice(4);
    const parts = raw.split("_");
    if (parts.length >= 4) {
      const country = parts[1]?.toUpperCase() ?? "";
      const metric =
        raw.includes("_debt_service_")
          ? "偿债率"
          : raw.includes("_leverage_nominal_")
            ? "杠杆率(按名义价值计)"
            : "杠杆率";
      const sector =
        raw.endsWith("_household")
          ? "居民部门"
          : raw.endsWith("_non_financial_corporate")
            ? "非金融企业部门"
            : raw.endsWith("_private_non_financial")
              ? "私营非金融部门"
              : raw.endsWith("_government")
                ? "政府部门"
                : "";
      return `${macroCountryName(country)} · ${metric}${sector ? ` · ${sector}` : ""}`;
    }
  }
  if (key.startsWith("mds:usov_")) {
    const raw = key.slice(4);
    const def = US_OVERVIEW_BY_CODE.get(raw);
    if (def) {
      return `美国 · ${def.catalogCategory} · ${def.displayName}`;
    }
    const panel = /^usov_c(\d+)_/i.exec(raw)?.[1] ?? "";
    const slug = raw.replace(/^usov_c\d+_/i, "");
    const pretty = slug
      .replace(/_/g, " ")
      .replace(/\b([a-z])/g, (s) => s.toUpperCase())
      .trim();
    return `美国 · US Overview${panel ? ` · 图${panel}` : ""} · ${pretty || raw}`;
  }
  if (key.startsWith("mds:chov_")) {
    const raw = key.slice(4);
    const def = CHINA_OVERVIEW_BY_CODE.get(raw);
    if (def) {
      return `中国 · ${def.catalogCategory} · ${def.displayName}`;
    }
    const panel = /^chov_c(\d+)_/i.exec(raw)?.[1] ?? "";
    const slug = raw.replace(/^chov_c\d+_/i, "");
    const pretty = slug
      .replace(/_/g, " ")
      .replace(/\b([a-z])/g, (s) => s.toUpperCase())
      .trim();
    return `中国 · China Overview${panel ? ` · 图${panel}` : ""} · ${pretty || raw}`;
  }
  if (key.startsWith("mds:jpov_")) {
    const raw = key.slice(4);
    const def = JAPAN_OVERVIEW_BY_CODE.get(raw);
    if (def) {
      return `日本 · ${def.catalogCategory} · ${def.displayName}`;
    }
    const panel = /^jpov_c(\d+)_/i.exec(raw)?.[1] ?? "";
    const slug = raw.replace(/^jpov_c\d+_/i, "");
    const pretty = slug
      .replace(/_/g, " ")
      .replace(/\b([a-z])/g, (s) => s.toUpperCase())
      .trim();
    return `日本 · Japan Overview${panel ? ` · 图${panel}` : ""} · ${pretty || raw}`;
  }
  return key;
}

/** @deprecated 服务端请用 `parseUnifiedSeriesQueryWithAllowlist` */
export function parseUnifiedSeriesQuery(raw: string | null): string[] {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return [...DEFAULT_UNIFIED_SERIES_KEYS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const k = part.trim();
    if (!k || !FRED_SERIES_KEY_RE.test(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MACRO_MAX_SERIES) break;
  }
  return out.length > 0 ? out : [...DEFAULT_UNIFIED_SERIES_KEYS];
}

export function serializeUnifiedKeys(keys: Iterable<string>, allowlist?: Set<string> | null): string {
  if (allowlist && allowlist.size > 0) {
    return serializeUnifiedKeysForAllowlist(keys, allowlist);
  }
  return [...new Set([...keys].map((k) => k.trim()).filter((k) => FRED_SERIES_KEY_RE.test(k)))]
    .slice(0, MACRO_MAX_SERIES)
    .join(",");
}

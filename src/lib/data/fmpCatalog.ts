/**
 * FMP 经济指标目录：合并 API 返回列表（若支持）与本地主名单，按主题分组供侧栏展示。
 */

const FMP_BASE = "https://financialmodelingprep.com/stable";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type UnifiedCatalogItem = {
  key: string;
  label: string;
  /** 更新频率：日 / 周 / 月 / 季度 / 年 */
  frequency: "日" | "周" | "月" | "季度" | "年";
};
export type UnifiedCatalogGroup = { name: string; items: UnifiedCatalogItem[] };

/** 与 `fmpMacro` 中请求上限一致 */
export const FMP_CATALOG_MACRO_MAX = 16;

/** 本地主名单：FMP `economic-indicators?name=` 常用名；与接口返回合并去重 */
export const FMP_MASTER_NAMES: readonly string[] = [
  "GDP",
  "realGDP",
  "nominalPotentialGDP",
  "realGDPPerCapita",
  "unemploymentRate",
  "totalNonfarmPayroll",
  "initialClaims",
  "CPI",
  "inflationRate",
  "inflation",
  "retailSales",
  "retailMoneyFunds",
  "federalFunds",
  "consumerSentiment",
  "durableGoods",
  "industrialProductionTotalIndex",
  "newPrivatelyOwnedHousingUnitsStartedTotalUnits",
  "totalVehicleSales",
  "smoothedUSRecessionProbabilities",
  "3MonthOr90DayRatesAndYieldsCertificatesOfDeposit",
  "commercialBankInterestRateOnCreditCardPlansAllAccounts",
  "30YearFixedRateMortgageAverage",
  "15YearFixedRateMortgageAverage",
] as const;

const FMP_LABEL_ZH: Record<string, string> = {
  GDP: "GDP（名义）",
  realGDP: "实际 GDP",
  nominalPotentialGDP: "名义潜在 GDP",
  realGDPPerCapita: "人均实际 GDP",
  grossNationalProduct: "国民生产总值",
  unemploymentRate: "失业率",
  totalNonfarmPayroll: "非农就业",
  initialClaims: "当周初请失业金",
  continuingClaims: "持续领取失业金",
  CPI: "CPI",
  inflationRate: "通胀率",
  inflation: "通胀",
  retailSales: "零售销售",
  retailMoneyFunds: "零售货币基金",
  federalFunds: "联邦基金利率",
  consumerSentiment: "消费者信心",
  durableGoods: "耐用品订单",
  industrialProductionTotalIndex: "工业生产指数",
  newPrivatelyOwnedHousingUnitsStartedTotalUnits: "新屋开工",
  totalVehicleSales: "汽车销量",
  smoothedUSRecessionProbabilities: "衰退概率（平滑）",
  "3MonthOr90DayRatesAndYieldsCertificatesOfDeposit": "3 个月存单利率",
  commercialBankInterestRateOnCreditCardPlansAllAccounts: "商业银行信用卡利率",
  "30YearFixedRateMortgageAverage": "30 年固定房贷利率",
  "15YearFixedRateMortgageAverage": "15 年固定房贷利率",
};

function humanizeCamel(name: string): string {
  const s = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return s.replace(/_/g, " ");
}

export function fmpDisplayLabel(name: string): string {
  return FMP_LABEL_ZH[name] ?? humanizeCamel(name);
}

function fmpCategoryForName(name: string): string {
  const n = name;
  if (/GDP|GNP|capita|Potential|NationalProduct|Income|Expenditure|Profits|Surplus|Deficit|GovernmentConsumption/i.test(n)) {
    return "产出、财政与增长";
  }
  if (/unemployment|Payroll|Claims|JOLTS|labor|Employment|hire|quit|AWHA|CES|hours|JTS/i.test(n)) {
    return "就业与劳动力市场";
  }
  if (/CPI|PPI|inflation|PCE|price|deflator|UMCSENT|sentiment/i.test(n)) {
    return "价格、通胀与预期";
  }
  if (/Funds|mortgage|yield|rate|GS\d|T\d|Y|FED|bond|VIX|interest|TED|spread/i.test(n)) {
    return "利率、利差与市场情绪";
  }
  if (/Housing|HOUST|PERMIT|housing|home|residential|construction|building|HousingUnits/i.test(n)) {
    return "地产与建筑";
  }
  if (/retail|Retail|sales|vehicle|Vehicle|RSAFS|wholesale|inventor|Orders|durable|Manufactur|capacity|INDPRO|production/i.test(n)) {
    return "消费、零售与生产";
  }
  if (/import|export|trade|Trade|DEX|DTWEX|exchange|FX|Balance/i.test(n)) {
    return "贸易与汇率";
  }
  if (/M1|M2|money|Money|credit|Credit|loan|Loan|reserve|Reserve|bank|RetailMoney/i.test(n)) {
    return "货币与信贷";
  }
  return "其他指标";
}

function fmpFrequencyForName(name: string): "日" | "周" | "月" | "季度" | "年" {
  if (/Claims|ICSA|CCSA|Mortgage/i.test(name)) return "周";
  if (/GDP|GNP|corporateProfits|governmentConsumption|federalSurplusOrDeficit/i.test(name)) {
    return "季度";
  }
  if (/M1|M2|CPI|PPI|PCE|Payroll|UNRATE|HOUST|PERMIT|retail|sales|production|trade|imports|exports|JTS|Funds|sentiment/i.test(name)) {
    return "月";
  }
  if (/VIX/i.test(name)) return "日";
  return "月";
}

function buildGroupsFromNames(sortedNames: string[]): UnifiedCatalogGroup[] {
  const byCat = new Map<string, UnifiedCatalogItem[]>();
  for (const name of sortedNames) {
    const cat = fmpCategoryForName(name);
    const items = byCat.get(cat) ?? [];
    items.push({
      key: `fmp:${name}`,
      label: fmpDisplayLabel(name),
      frequency: fmpFrequencyForName(name),
    });
    byCat.set(cat, items);
  }
  const order = [
    "产出、财政与增长",
    "就业与劳动力市场",
    "价格、通胀与预期",
    "利率、利差与市场情绪",
    "地产与建筑",
    "消费、零售与生产",
    "贸易与汇率",
    "货币与信贷",
    "其他指标",
  ];
  return order
    .filter((c) => byCat.has(c))
    .map((name) => ({
      name,
      items: (byCat.get(name) ?? []).sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    }));
}

function extractNamesFromJson(json: unknown): string[] {
  if (!Array.isArray(json) || json.length === 0) return [];
  const first = json[0];
  if (!first || typeof first !== "object") {
    const set = new Set<string>();
    for (const row of json) {
      if (typeof row === "string") {
        const t = row.trim();
        if (/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) set.add(t);
      }
    }
    return [...set];
  }
  const o0 = first as Record<string, unknown>;
  const looksLikeTimeSeriesPoint =
    typeof o0.date === "string" &&
    (typeof o0.value === "number" ||
      typeof o0.value === "string" ||
      o0.value === null);
  if (looksLikeTimeSeriesPoint) {
    const fromRows = new Set<string>();
    for (const row of json) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.name === "string") fromRows.add(r.name.trim());
    }
    /** 无 `name` 的列表接口误返回单指标历史时，各行 `name` 相同，不能当作「指标目录」 */
    if (fromRows.size <= 1) return [];
  }

  const set = new Set<string>();
  for (const row of json) {
    if (typeof row === "string") {
      const t = row.trim();
      if (/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) set.add(t);
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const cand = o.name ?? o.indicator ?? o.series ?? o.symbol ?? o.event;
    if (typeof cand === "string") {
      const t = cand.trim();
      if (/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) set.add(t);
    }
  }
  return [...set];
}

/**
 * 尝试从 FMP 拉取「全部指标名」；不同套餐/版本返回结构可能不同，解析失败则返回 null。
 */
async function tryFetchRemoteIndicatorNames(apiKey: string): Promise<string[] | null> {
  const urls = [
    `${FMP_BASE}/economic-indicators?apikey=${encodeURIComponent(apiKey)}`,
    `https://financialmodelingprep.com/api/v3/economic_indicators_list?apikey=${encodeURIComponent(apiKey)}`,
  ];
  const timeoutMs = 2200;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const names = extractNamesFromJson(json);
      if (names.length >= 3) return names;
    } catch {
      /* timeout/network/parser errors: try next endpoint */
    }
  }
  return null;
}

function mergeNameLists(remote: string[] | null, master: readonly string[]): string[] {
  const set = new Set<string>();
  for (const n of master) set.add(n);
  if (remote) for (const n of remote) if (/^[A-Za-z][A-Za-z0-9._]*$/.test(n)) set.add(n);
  return [...set].sort((a, b) => a.localeCompare(b));
}

type CatalogCache = {
  groups: UnifiedCatalogGroup[];
  allowlist: Set<string>;
  builtAt: number;
};

let catalogCache: CatalogCache | null = null;

export async function getFmpCatalogCached(): Promise<CatalogCache> {
  if (catalogCache && Date.now() - catalogCache.builtAt < CACHE_TTL_MS) {
    return catalogCache;
  }

  const apiKey = process.env.FMP_API_KEY?.trim();
  const remote = apiKey ? await tryFetchRemoteIndicatorNames(apiKey) : null;
  const names = mergeNameLists(remote, FMP_MASTER_NAMES);
  const groups = buildGroupsFromNames(names);
  const allowlist = new Set(names.map((n) => `fmp:${n}`));

  catalogCache = { groups, allowlist, builtAt: Date.now() };
  return catalogCache;
}

/** 使测试或热替换时可清缓存 */
export function clearFmpCatalogCache(): void {
  catalogCache = null;
}

export function parseUnifiedSeriesQueryWithAllowlist(
  raw: string | null,
  allowlist: Set<string>,
): string[] {
  const trimmed = raw?.trim() ?? "";
  const fallback = ["fmp:GDP", "fmp:inflationRate", "fmp:unemploymentRate"].filter((k) =>
    allowlist.has(k),
  );
  const defaultKeys =
    fallback.length > 0 ? fallback : [...allowlist].slice(0, 3).sort((a, b) => a.localeCompare(b));

  if (!trimmed) return defaultKeys.length > 0 ? defaultKeys : ["fmp:GDP"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const k = part.trim();
    if (!k || !allowlist.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= FMP_CATALOG_MACRO_MAX) break;
  }

  return out.length > 0 ? out : defaultKeys;
}

export function serializeUnifiedKeysForAllowlist(
  keys: Iterable<string>,
  allowlist: Set<string>,
): string {
  return [
    ...new Set(
      [...keys]
        .map((k) => k.trim())
        .filter((k) => allowlist.has(k)),
    ),
  ]
    .slice(0, FMP_CATALOG_MACRO_MAX)
    .join(",");
}

/** 无 allowlist 时用于仅展示文案等场景 */
export function fmpDisplayLabelLoose(key: string): string {
  if (!key.startsWith("fmp:")) return key;
  return fmpDisplayLabel(key.slice(4));
}

/** 未拉取到远程目录时侧栏静态分组（仅主名单） */
export function getFmpCatalogStaticFallback(): UnifiedCatalogGroup[] {
  return buildGroupsFromNames([...FMP_MASTER_NAMES]);
}

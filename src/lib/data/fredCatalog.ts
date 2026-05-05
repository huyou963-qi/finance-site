/**
 * FRED 宏观指标目录：静态精选清单，按主题分组，供侧栏选择与服务端校验。
 */

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type UnifiedCatalogItem = {
  key: string;
  label: string;
  /** 更新频率：日 / 周 / 月 / 季度 / 年 */
  frequency: "日" | "周" | "月" | "季度" | "年";
};
export type UnifiedCatalogGroup = { name: string; items: UnifiedCatalogItem[] };

const FRED_ITEMS: Array<{
  id: string;
  label: string;
  category: string;
  frequency: UnifiedCatalogItem["frequency"];
}> = [
  // 增长与景气
  { id: "GDPC1", label: "美国实际 GDP（季调，十亿美元）", category: "增长与景气", frequency: "季度" },
  { id: "GDP", label: "美国名义 GDP（季调，十亿美元）", category: "增长与景气", frequency: "季度" },
  { id: "A191RL1Q225SBEA", label: "美国实际 GDP 环比年化（%）", category: "增长与景气", frequency: "季度" },
  { id: "INDPRO", label: "工业生产指数（2017=100）", category: "增长与景气", frequency: "月" },
  { id: "USREC", label: "NBER 衰退指标（0/1）", category: "增长与景气", frequency: "月" },
  { id: "CFNAI", label: "芝加哥联储全国活动指数", category: "增长与景气", frequency: "月" },

  // 就业与劳动力
  { id: "UNRATE", label: "失业率（%）", category: "就业与劳动力", frequency: "月" },
  { id: "PAYEMS", label: "非农就业人数（千人）", category: "就业与劳动力", frequency: "月" },
  { id: "CIVPART", label: "劳动参与率（%）", category: "就业与劳动力", frequency: "月" },
  { id: "ICSA", label: "首次申请失业救济人数", category: "就业与劳动力", frequency: "周" },
  { id: "AHETPI", label: "私人部门平均时薪（同比，%）", category: "就业与劳动力", frequency: "月" },
  { id: "JTSJOL", label: "职位空缺数（千人）", category: "就业与劳动力", frequency: "月" },

  // 通胀与价格
  { id: "CPIAUCSL", label: "CPI（全部城市消费者）", category: "通胀与价格", frequency: "月" },
  { id: "CPILFESL", label: "核心 CPI（剔除食物与能源）", category: "通胀与价格", frequency: "月" },
  { id: "PCEPI", label: "PCE 价格指数", category: "通胀与价格", frequency: "月" },
  { id: "PCEPILFE", label: "核心 PCE 价格指数", category: "通胀与价格", frequency: "月" },
  { id: "PPIACO", label: "PPI（所有商品）", category: "通胀与价格", frequency: "月" },
  { id: "T5YIE", label: "5 年盈亏平衡通胀率（%）", category: "通胀与价格", frequency: "日" },

  // 利率与货币条件
  { id: "FEDFUNDS", label: "联邦基金有效利率（%）", category: "利率与货币条件", frequency: "月" },
  { id: "SOFR", label: "SOFR（担保隔夜融资利率，%）", category: "利率与货币条件", frequency: "日" },
  { id: "DFF", label: "联邦基金有效利率（日度，%）", category: "利率与货币条件", frequency: "日" },
  { id: "M2SL", label: "M2 货币供应量（十亿美元）", category: "利率与货币条件", frequency: "月" },
  { id: "WALCL", label: "美联储总资产（百万美元）", category: "利率与货币条件", frequency: "周" },
  { id: "RRPONTSYD", label: "隔夜逆回购使用量（百万美元）", category: "利率与货币条件", frequency: "日" },

  // 利率曲线与信用
  { id: "GS10", label: "10 年期美债收益率（%）", category: "利率曲线与信用", frequency: "月" },
  { id: "GS2", label: "2 年期美债收益率（%）", category: "利率曲线与信用", frequency: "月" },
  { id: "TB3MS", label: "3 个月国债收益率（%）", category: "利率曲线与信用", frequency: "月" },
  { id: "T10Y2Y", label: "10Y-2Y 国债期限利差（%）", category: "利率曲线与信用", frequency: "日" },
  { id: "T10Y3M", label: "10Y-3M 国债期限利差（%）", category: "利率曲线与信用", frequency: "日" },
  { id: "BAMLH0A0HYM2", label: "美国高收益债 OAS（%）", category: "利率曲线与信用", frequency: "日" },

  // 消费与房地产
  { id: "PCE", label: "个人消费支出（十亿美元）", category: "消费与房地产", frequency: "月" },
  { id: "PCEC96", label: "实际个人消费支出（十亿美元）", category: "消费与房地产", frequency: "月" },
  { id: "RSAFS", label: "零售销售总额（百万美元）", category: "消费与房地产", frequency: "月" },
  { id: "UMCSENT", label: "密歇根大学消费者信心指数", category: "消费与房地产", frequency: "月" },
  { id: "HOUST", label: "新屋开工（年化套数）", category: "消费与房地产", frequency: "月" },
  { id: "CSUSHPINSA", label: "标普/Case-Shiller 房价指数（美国）", category: "消费与房地产", frequency: "月" },

  // 外汇与金融市场
  { id: "DTWEXBGS", label: "美元名义广义指数", category: "外汇与金融市场", frequency: "日" },
  { id: "DEXUSEU", label: "美元/欧元汇率", category: "外汇与金融市场", frequency: "日" },
  { id: "DEXJPUS", label: "日元/美元汇率", category: "外汇与金融市场", frequency: "日" },
  { id: "DCOILWTICO", label: "WTI 原油现货价（美元/桶）", category: "外汇与金融市场", frequency: "日" },
  { id: "GOLDAMGBD228NLBM", label: "伦敦金下午定盘价（美元/盎司）", category: "外汇与金融市场", frequency: "日" },
  { id: "VIXCLS", label: "VIX 波动率指数", category: "外汇与金融市场", frequency: "日" },
];

const FRED_LABEL_BY_ID = new Map(FRED_ITEMS.map((x) => [x.id, x.label]));

export const FRED_CATALOG_MACRO_MAX = 20;

type CatalogCache = {
  groups: UnifiedCatalogGroup[];
  allowlist: Set<string>;
  builtAt: number;
};

let catalogCache: CatalogCache | null = null;

function buildGroups(): UnifiedCatalogGroup[] {
  const byCat = new Map<string, UnifiedCatalogItem[]>();
  for (const row of FRED_ITEMS) {
    const items = byCat.get(row.category) ?? [];
    items.push({
      key: `fred:${row.id}`,
      label: row.label,
      frequency: row.frequency,
    });
    byCat.set(row.category, items);
  }
  return [...byCat.entries()].map(([name, items]) => ({
    name,
    items: items.sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
  }));
}

export function fredDisplayLabel(id: string): string {
  return FRED_LABEL_BY_ID.get(id.toUpperCase()) ?? id;
}

export async function getFredCatalogCached(): Promise<CatalogCache> {
  if (catalogCache && Date.now() - catalogCache.builtAt < CACHE_TTL_MS) return catalogCache;
  const groups = buildGroups();
  const allowlist = new Set(FRED_ITEMS.map((x) => `fred:${x.id}`));
  catalogCache = { groups, allowlist, builtAt: Date.now() };
  return catalogCache;
}

export function clearFredCatalogCache(): void {
  catalogCache = null;
}

export function parseUnifiedSeriesQueryWithAllowlist(
  raw: string | null,
  allowlist: Set<string>,
): string[] {
  const trimmed = raw?.trim() ?? "";
  const fallback = ["fred:GDPC1", "fred:CPIAUCSL", "fred:UNRATE"].filter((k) =>
    allowlist.has(k),
  );
  const defaultKeys =
    fallback.length > 0 ? fallback : [...allowlist].slice(0, 3).sort((a, b) => a.localeCompare(b));

  if (!trimmed) return defaultKeys.length > 0 ? defaultKeys : ["fred:GDPC1"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of trimmed.split(",")) {
    const k = part.trim();
    if (!k || !allowlist.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= FRED_CATALOG_MACRO_MAX) break;
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
    .slice(0, FRED_CATALOG_MACRO_MAX)
    .join(",");
}

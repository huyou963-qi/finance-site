import type { DataGranularity } from "@prisma/client";

/**
 * Jay Ritter（佛罗里达大学）美股 IPO 月度统计——数据源。
 *
 * FRED 对 IPO 零覆盖（`search_text=IPO` 命中 0 条，"initial public offering" 只命中
 * 无关的按揭指数，2026-09 实测），SDC/Dealogic/Refinitiv 均为付费源。Ritter 的
 * `IPOALL.xlsx` 是学术界引用的标准公开数据集，robots.txt 未 Disallow（2026-09 核实），
 * 无需登录、无表单墙。
 *
 * ⚠ 更新节奏：这是**年度更新**的研究数据集（2025 全年数据在 2026-01 补齐），不是
 * 实时源。它解决"历史统计"，不解决"本月谁上市了"。当期 IPO 跟踪另议（Nasdaq 的
 * IPO API 数据虽好但 api.nasdaq.com/robots.txt 全站 Disallow，按合规规则不可抓）。
 *
 * ⚠ 源文件结构陷阱（均已实测，解析器必须照此处理）：
 * 1. **没有表头行**——第 0 行就是数据，列含义只写在文件末尾 793–798 行的脚注里。
 *    因此只能靠"col0 是 1..12 的月份且 col1 是数字年份"来锚定数据行。
 * 2. **年份是两位数**（0–99）：60–99 → 19xx，0–59 → 20xx。当前数据 1960–2025，
 *    该推断无歧义；解析器另有 [1960, 次年] 的合理性兜底，源跨到 2060 时会报错而非静默取错。
 * 3. **四列各自的起始年份不同**，且用字符串哨兵占位而非留空：净发行家数 1975 年前
 *    写 "see 1975"，中值占比 1980 年前写 "see 1980"，个别月份写 "." 或 "na"。
 *    必须逐列独立判断该单元格是否为数字，不能假设整行齐全。
 * 4. 另有 2020 年后才出现的稀疏列（proceeds-weighted return / avg money left on
 *    table / avg proceeds / SPAC 家数与首日涨幅，仅 38–72 个点，且 2019-09 行里混着
 *    "N"/"first-day returns" 之类的行内表头）——覆盖太短且结构不规整，本次不接入。
 */
export const RITTER_IPO_PAGE_URL = "https://site.warrington.ufl.edu/ritter/ipo-data/";
export const RITTER_IPO_XLS_URL = "https://site.warrington.ufl.edu/ritter/files/IPOALL.xlsx";
export const RITTER_IPO_SYNC_SCRIPT = "scripts/data-worker/sync-ritter-ipo.ts";

/** 数据行里各序列对应的列号（源文件无表头，只能按列序取——见上方陷阱 1） */
export type RitterIpoSeriesKey =
  | "first_day_return"
  | "count_gross"
  | "count_net"
  | "above_midpoint_pct";

export type RitterIpoSeriesConfig = {
  seriesKey: RitterIpoSeriesKey;
  /** scrape.provider 分发用 */
  provider: string;
  instrumentCode: string;
  /** 0-based 列号 */
  columnIndex: number;
  name: string;
  displayName: string;
  freqLabel: "月";
  granularity: DataGranularity;
  unit: string;
  category: string;
  countryCode: "US";
  officialUrl: string;
  sourceUpdateNote: string;
  /** 值域校验（宽松边界，只为拦截列错位/单位错乱） */
  valueRange: readonly [number, number];
  /** 实测最早有值月份，仅用于 verify 断言与文档 */
  firstObsMonth: string;
};

export const RITTER_IPO_SERIES: readonly RitterIpoSeriesConfig[] = [
  {
    seriesKey: "first_day_return",
    provider: "ritter_ipo_first_day_return",
    instrumentCode: "ritter_us_ipo_first_day_return",
    columnIndex: 2,
    name: "US IPO Average First-Day Return (Ritter)",
    displayName: "美股 IPO 首日平均涨幅",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    sourceUpdateNote:
      "按净口径 IPO 计算的当月首日平均涨幅，年度更新（次年 1 月补齐上一年），1960-01 起",
    valueRange: [-100, 500],
    firstObsMonth: "1960-01",
  },
  {
    seriesKey: "count_gross",
    provider: "ritter_ipo_count_gross",
    instrumentCode: "ritter_us_ipo_count_gross",
    columnIndex: 3,
    name: "US IPO Count, Gross (Ritter)",
    displayName: "美股 IPO 发行家数（毛口径）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "家",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    sourceUpdateNote:
      "毛口径含 SPAC、直接上市、仙股、单位（units）、封闭式基金等，年度更新，1960-01 起",
    valueRange: [0, 1000],
    firstObsMonth: "1960-01",
  },
  {
    seriesKey: "count_net",
    provider: "ritter_ipo_count_net",
    instrumentCode: "ritter_us_ipo_count_net",
    columnIndex: 4,
    name: "US IPO Count, Net (Ritter)",
    displayName: "美股 IPO 发行家数（净口径）",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "家",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    // 源文件 1975 年前该列写 "see 1975" 字符串哨兵，不是空值
    sourceUpdateNote:
      "净口径剔除封闭式基金、REITs、SPAC、发行价<$5、ADR、有限合伙、单位等，仅 1975-01 起有值",
    valueRange: [0, 1000],
    firstObsMonth: "1975-01",
  },
  {
    seriesKey: "above_midpoint_pct",
    provider: "ritter_ipo_above_midpoint_pct",
    instrumentCode: "ritter_us_ipo_above_midpoint_pct",
    columnIndex: 5,
    name: "US IPOs Priced Above Midpoint, Share (Ritter)",
    displayName: "美股 IPO 定价高于区间中值占比",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    // 源文件 1980 年前该列写 "see 1980" 字符串哨兵
    sourceUpdateNote:
      "定价高于原始申报区间中值的 IPO 占比（仅计中值≥$8.00 的发行），仅 1980-01 起有值",
    valueRange: [0, 100],
    firstObsMonth: "1980-01",
  },
] as const;

export function ritterIpoSeriesByProvider(provider: string): RitterIpoSeriesConfig | null {
  return RITTER_IPO_SERIES.find((s) => s.provider === provider) ?? null;
}

export const RITTER_IPO_SOURCE = {
  id: "ritter-ipo-data",
  agencyId: "us-uf-ritter",
  nameZh: "佛罗里达大学 Jay Ritter IPO 数据集",
  nameEn: "University of Florida — Jay R. Ritter IPO Data",
  name: "Ritter 美股 IPO 月度统计",
  baseUrl: RITTER_IPO_PAGE_URL,
  termsUrl: RITTER_IPO_PAGE_URL,
  websiteUrl: "https://site.warrington.ufl.edu/ritter/",
} as const;

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
 * 4. **2019-08/2019-09 两行的 col13/col14 里混着行内表头**（"SPAC IPOs"/"N"/
 *    "first-day returns"）——它们所在的行本身是合法数据行（月/年都正常），所以
 *    这些标签串已列入解析器的已知哨兵，否则会被当成源改版计入 skippedInvalid。
 * 5. 源里另有三列 **已断更**：proceeds-weighted return（col7）、avg money left on
 *    the table（col8）、avg proceeds（col9），实测只覆盖 2020-01→2023-02 共 38 个月，
 *    此后 Ritter 不再维护。**故意不接入**——接进来是永不更新的僵尸序列，还得给它
 *    特批过期豁免。若将来只做历史研究可另行一次性导入，勿挂到调度上。
 * 6. col13/col14（SPAC 家数与首日涨幅）则是活的，2020-01→2025-12 与主序列同步更新，
 *    已接入。注意 col14 用小数记录，入库乘 100 统一为 %（见 scaleBy）。
 */
export const RITTER_IPO_PAGE_URL = "https://site.warrington.ufl.edu/ritter/ipo-data/";
export const RITTER_IPO_XLS_URL = "https://site.warrington.ufl.edu/ritter/files/IPOALL.xlsx";
export const RITTER_IPO_SYNC_SCRIPT = "scripts/data-worker/sync-ritter-ipo.ts";

/** 数据行里各序列对应的列号（源文件无表头，只能按列序取——见上方陷阱 1） */
export type RitterIpoSeriesKey =
  | "first_day_return"
  | "count_gross"
  | "count_net"
  | "above_midpoint_pct"
  | "spac_count"
  | "spac_first_day_return";

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
  /** 值域校验（宽松边界，只为拦截列错位/单位错乱）。针对**换算后**的入库值。 */
  valueRange: readonly [number, number];
  /** 实测最早有值月份，仅用于 verify 断言与文档 */
  firstObsMonth: string;
  /**
   * 入库前的换算系数。源文件主涨幅列（col2）用百分数（13.8 = 13.8%），
   * 但 SPAC 涨幅列（col14）用小数（0.038 = 3.8%）——同一文件两种口径。
   * 统一乘 100 存成 %，两条首日涨幅序列才能直接叠在同一张图上比。
   */
  scaleBy?: number;
  /**
   * 该分项在源里可选。四条核心序列（1960/1975/1980 起）是骨干，解析后 0 点一律
   * 报错；SPAC 两列是源方后加的附加统计，若哪天被撤掉，不应连累核心序列同步失败，
   * 故解析器放行、由 verify 的 MIN_COUNT 在监控层报警。
   */
  optional?: boolean;
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
  {
    seriesKey: "spac_count",
    provider: "ritter_ipo_spac_count",
    instrumentCode: "ritter_us_ipo_spac_count",
    columnIndex: 13,
    name: "US SPAC IPO Count (Ritter)",
    displayName: "美股 SPAC 发行家数",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "家",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    sourceUpdateNote: "SPAC（特殊目的收购公司）月度发行家数，源文件 2020-01 起单列统计",
    valueRange: [0, 1000],
    firstObsMonth: "2020-01",
    optional: true,
  },
  {
    seriesKey: "spac_first_day_return",
    provider: "ritter_ipo_spac_first_day_return",
    instrumentCode: "ritter_us_ipo_spac_first_day_return",
    columnIndex: 14,
    name: "US SPAC IPO Average First-Day Return (Ritter)",
    displayName: "美股 SPAC 首日平均涨幅",
    freqLabel: "月",
    granularity: "MONTHLY",
    unit: "%",
    category: "利率与信用市场",
    countryCode: "US",
    officialUrl: RITTER_IPO_PAGE_URL,
    // 源用小数（0.038），入库乘 100 统一成 % —— 与主涨幅列口径对齐
    sourceUpdateNote:
      "SPAC 月度首日平均涨幅，源文件以小数记录（0.038=3.8%），入库统一换算为百分数，2020-01 起",
    valueRange: [-50, 200],
    firstObsMonth: "2020-01",
    scaleBy: 100,
    optional: true,
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

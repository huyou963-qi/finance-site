import { WGC_GOLD_PRICE_PACKAGE_ID, WGC_GOLD_PRICE_RELEASE_RULE, WGC_GOLD_PRICE_SOURCE } from "../wgcGoldPrice/catalog";
import {
  COMEX_GOLD_SYMBOL,
  YAHOO_CHART_SOURCE,
  YAHOO_GOLD_PACKAGE_ID,
  YAHOO_GOLD_RELEASE_RULE,
} from "../yahooGold/catalog";

/**
 * 黄金现货 / 期货价格——标准基础序列（2026-09-21）。
 *
 * 取代旧 xlsx 模板列（goldov_c01 / goldov_c02 / usov_c05）：那几条是 Wind/IDC 历史 + 其他源续接的
 * 拼接序列，口径在接缝处变了（伦敦金现 2026-06 后被期货价续接，比现货高约 0.7%；
 * COMEX 连续 2020 年后与 GC=F 中位差 8 美元），且无法从任何可自动更新的源复现。
 * 改为每条**整段只用一个源**：
 *
 * - wgc_gold_price_usd：世界黄金协会 LBMA 黄金价格，美元/盎司，日频，1970 年起。
 *   与旧 IDC 伦敦金现同日差值中位数 0.41%（取价时点不同：LBMA 伦敦下午定盘 vs IDC 收盘），
 *   错开一天差值变大，说明日期对齐无误。LBMA 金价归 ICE Benchmark Administration 所有。
 * - comex_gold_futures：COMEX 黄金期货连续合约收盘价（Yahoo GC=F），日频，2000-08 起。
 *   ⚠ Yahoo 的换月规则未公开且变过：2000–2009 与近月连续逐日相等，2020Q2 起跟踪主力合约。
 *   逐合约日线在 mds.futures_contract_bar（futures:snapshot-gold），这里只存交易所连续报价。
 *
 * 旧仪器登记在 retiredIndicators.ts 的 SUPERSEDED_KEEP_HISTORY_REPLACEMENTS：
 * 模板键替换为这里的标准键，目录隐藏、停止抓取，**历史观测保留**。
 */
export const GOLD_SPOT_CODE = "wgc_gold_price_usd";
export const GOLD_FUTURES_CODE = "comex_gold_futures";

export type GoldPriceInstrumentDef = {
  code: string;
  name: string;
  nameEn: string;
  shortName: string;
  description: string;
  unit: string;
  freqLabel: string;
  source: { id: string; name: string; seriesKey: string; url: string; officialUrl: string };
  scrape: Record<string, string>;
  acquisitionMethod: string;
  acquisitionLabel: string;
  releaseRule: { type: "probe_interval"; intervalHours: number };
  packageId: string;
  /** 数据源首个观测，用于自检下限 */
  expectedStart: string;
};

export const GOLD_PRICE_INSTRUMENTS: readonly GoldPriceInstrumentDef[] = [
  {
    code: GOLD_SPOT_CODE,
    name: "黄金现货价格:LBMA金价(美元/盎司)",
    nameEn: "LBMA Gold Price (USD/oz)",
    shortName: "伦敦金现",
    description: "LBMA 黄金价格（伦敦下午定盘），美元/盎司，日频；世界黄金协会发布。",
    unit: "美元/盎司",
    freqLabel: "日",
    source: {
      id: WGC_GOLD_PRICE_SOURCE.id,
      name: "世界黄金协会",
      seriesKey: "usd/oz",
      url: WGC_GOLD_PRICE_SOURCE.baseUrl,
      officialUrl: WGC_GOLD_PRICE_SOURCE.pageUrl,
    },
    scrape: { provider: "wgc_gold_price", currency: "usd", unit: "oz", url: WGC_GOLD_PRICE_SOURCE.baseUrl },
    acquisitionMethod: "wgc_gold_price",
    acquisitionLabel: "世界黄金协会金价接口",
    releaseRule: WGC_GOLD_PRICE_RELEASE_RULE,
    packageId: WGC_GOLD_PRICE_PACKAGE_ID,
    expectedStart: "1970-01-31",
  },
  {
    code: GOLD_FUTURES_CODE,
    name: "期货收盘价(连续):COMEX黄金",
    nameEn: "COMEX Gold Futures Continuous Close (GC=F)",
    shortName: "COMEX黄金期货",
    description:
      "COMEX 黄金期货连续合约收盘价（Yahoo 行情 GC=F），美元/盎司，日频。换月规则由 Yahoo 决定：2020Q2 起跟踪主力合约。",
    unit: "美元/盎司",
    freqLabel: "日",
    source: {
      id: YAHOO_CHART_SOURCE.id,
      name: "COMEX（Yahoo 行情）",
      seriesKey: COMEX_GOLD_SYMBOL,
      url: `${YAHOO_CHART_SOURCE.baseUrl}/${encodeURIComponent(COMEX_GOLD_SYMBOL)}`,
      officialUrl: "https://www.cmegroup.com/markets/metals/precious/gold.html",
    },
    scrape: {
      provider: "yahoo_chart",
      symbol: COMEX_GOLD_SYMBOL,
      url: `${YAHOO_CHART_SOURCE.baseUrl}/${encodeURIComponent(COMEX_GOLD_SYMBOL)}`,
    },
    acquisitionMethod: "yahoo_chart",
    acquisitionLabel: `行情接口 Yahoo ${COMEX_GOLD_SYMBOL}`,
    releaseRule: YAHOO_GOLD_RELEASE_RULE,
    packageId: YAHOO_GOLD_PACKAGE_ID,
    expectedStart: "2000-08-30",
  },
];

/** 被标准序列取代的旧 xlsx 模板列 → 标准仪器代码 */
export const GOLD_SUPERSEDED_BY: Readonly<Record<string, string>> = {
  goldov_c02_london_gold: GOLD_SPOT_CODE,
  goldov_c01_comex_active: GOLD_FUTURES_CODE,
  usov_c05_comex_gold: GOLD_FUTURES_CODE,
};

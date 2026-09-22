import type { GoldPriceInstrumentDef } from "../goldPrices/catalog";
import { YAHOO_CHART_SOURCE } from "../yahooGold/catalog";

/**
 * WTI 原油期货——标准基础序列（2026-09-22）。
 *
 * 为什么不用 FRED DCOILWTICO：那是 EIA 库欣现货，FRED 每周三才批量更新一次，
 * 最新观测常滞后 5–7 个交易日（2026-09-22 时 FRED 停在 09-15，而期间 WTI 从 107 跌到 90），
 * 对「最近 1/4 周市场在交易什么」的高频判断没法用。
 * 改用 NYMEX WTI 连续期货收盘价（Yahoo CL=F），当日更新；整段只用这一个源，不与 EIA 现货拼接。
 * 口径差：与 DCOILWTICO 同日中位差 1.15%、P95 3.3%（2024-01 起 674 天重叠），
 * 是期货近月与现货的基差，不是日期错位。
 * ⚠ Yahoo 对 2020-04-20 的负结算价做了清洗（全历史最低 10.01），不代表交易所记录。
 * sched_fred_DCOILWTICO 保留，CPI 分析等按月均使用它的地方不受影响。
 */
export const WTI_FUTURES_CODE = "nymex_wti_futures";
export const WTI_FUTURES_SYMBOL = "CL=F";
export const YAHOO_WTI_PACKAGE_ID = "us.yahoo.nymex_wti";

export const OIL_PRICE_INSTRUMENTS: readonly GoldPriceInstrumentDef[] = [
  {
    code: WTI_FUTURES_CODE,
    name: "期货收盘价(连续):NYMEX WTI原油",
    nameEn: "NYMEX WTI Crude Oil Futures Continuous Close (CL=F)",
    shortName: "WTI原油期货",
    description:
      "NYMEX WTI 原油期货连续合约收盘价（Yahoo 行情 CL=F），美元/桶，日频、当日更新。换月规则由 Yahoo 决定。",
    unit: "美元/桶",
    freqLabel: "日",
    source: {
      id: YAHOO_CHART_SOURCE.id,
      name: "NYMEX（Yahoo 行情）",
      seriesKey: WTI_FUTURES_SYMBOL,
      url: `${YAHOO_CHART_SOURCE.baseUrl}/${encodeURIComponent(WTI_FUTURES_SYMBOL)}`,
      officialUrl: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html",
    },
    scrape: {
      provider: "yahoo_chart",
      symbol: WTI_FUTURES_SYMBOL,
      url: `${YAHOO_CHART_SOURCE.baseUrl}/${encodeURIComponent(WTI_FUTURES_SYMBOL)}`,
    },
    acquisitionMethod: "yahoo_chart",
    acquisitionLabel: `行情接口 Yahoo ${WTI_FUTURES_SYMBOL}`,
    // 高频判断的输入：6h 探测，收盘后当晚即可入库（当日盘中 bar 由修订回看覆盖为收盘值）
    releaseRule: { type: "probe_interval", intervalHours: 6 },
    packageId: YAHOO_WTI_PACKAGE_ID,
    expectedStart: "2000-08-23",
  },
];

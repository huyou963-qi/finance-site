/**
 * 大宗商品 / 外汇 / 债券利率 / 加密 的检索白名单（Yahoo Finance 代码）。
 *
 * 这些标的 SEC company_tickers 不收录，故行情页联想此前只能搜到美股/ETF。
 * K 线引擎（yahooKlineProvider → getAdjustedDailyBars → 远端回补）本就能按 Yahoo
 * 代码取数，缺的只是「可被搜到」。此表提供中英文别名，接入 usEquitySearch 后即可检索。
 *
 * 代码均已对 Yahoo v8 chart API 校验可返回 1d 数据。
 */

export type MarketInstrumentType = "商品" | "外汇" | "债券" | "加密";

export type MarketInstrument = {
  symbol: string;
  /** 中文主名 */
  name: string;
  /** 交易所 / 市场 */
  exchange: string;
  type: MarketInstrumentType;
  /** 检索别名（中英文、常用简写） */
  aliases: string[];
};

export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  // ---------------- 大宗商品 ----------------
  { symbol: "GC=F", name: "黄金", exchange: "COMEX", type: "商品", aliases: ["黄金", "金", "gold", "xau", "au"] },
  { symbol: "SI=F", name: "白银", exchange: "COMEX", type: "商品", aliases: ["白银", "银", "silver", "xag"] },
  { symbol: "HG=F", name: "铜", exchange: "COMEX", type: "商品", aliases: ["铜", "copper", "沪铜", "hg"] },
  { symbol: "PL=F", name: "铂金", exchange: "NYMEX", type: "商品", aliases: ["铂金", "铂", "platinum", "xpt"] },
  { symbol: "PA=F", name: "钯金", exchange: "NYMEX", type: "商品", aliases: ["钯金", "钯", "palladium", "xpd"] },
  { symbol: "CL=F", name: "WTI 原油", exchange: "NYMEX", type: "商品", aliases: ["原油", "美油", "wti", "crude", "oil", "石油"] },
  { symbol: "BZ=F", name: "布伦特原油", exchange: "ICE", type: "商品", aliases: ["布伦特", "布油", "brent", "原油", "石油"] },
  { symbol: "NG=F", name: "天然气", exchange: "NYMEX", type: "商品", aliases: ["天然气", "natural gas", "natgas", "gas"] },
  { symbol: "RB=F", name: "RBOB 汽油", exchange: "NYMEX", type: "商品", aliases: ["汽油", "gasoline", "rbob"] },
  { symbol: "ZC=F", name: "玉米", exchange: "CBOT", type: "商品", aliases: ["玉米", "corn"] },
  { symbol: "ZW=F", name: "小麦", exchange: "CBOT", type: "商品", aliases: ["小麦", "wheat"] },
  { symbol: "ZS=F", name: "大豆", exchange: "CBOT", type: "商品", aliases: ["大豆", "soybean", "soybeans"] },
  { symbol: "KC=F", name: "咖啡", exchange: "ICE", type: "商品", aliases: ["咖啡", "coffee"] },
  { symbol: "SB=F", name: "白糖", exchange: "ICE", type: "商品", aliases: ["白糖", "糖", "sugar"] },
  { symbol: "CT=F", name: "棉花", exchange: "ICE", type: "商品", aliases: ["棉花", "cotton"] },
  { symbol: "CC=F", name: "可可", exchange: "ICE", type: "商品", aliases: ["可可", "cocoa"] },

  // ---------------- 外汇 ----------------
  { symbol: "DX-Y.NYB", name: "美元指数", exchange: "ICE", type: "外汇", aliases: ["美元指数", "美指", "dxy", "dollar index", "usdx"] },
  { symbol: "EURUSD=X", name: "欧元/美元", exchange: "FX", type: "外汇", aliases: ["欧元", "eur", "eurusd", "欧美"] },
  { symbol: "GBPUSD=X", name: "英镑/美元", exchange: "FX", type: "外汇", aliases: ["英镑", "gbp", "gbpusd", "镑美"] },
  { symbol: "USDJPY=X", name: "美元/日元", exchange: "FX", type: "外汇", aliases: ["日元", "jpy", "usdjpy", "美日"] },
  { symbol: "USDCNH=X", name: "美元/离岸人民币", exchange: "FX", type: "外汇", aliases: ["人民币", "离岸人民币", "cnh", "usdcnh", "美元人民币"] },
  { symbol: "USDCNY=X", name: "美元/在岸人民币", exchange: "FX", type: "外汇", aliases: ["人民币", "在岸人民币", "cny", "usdcny"] },
  { symbol: "AUDUSD=X", name: "澳元/美元", exchange: "FX", type: "外汇", aliases: ["澳元", "aud", "audusd", "澳美"] },
  { symbol: "USDCAD=X", name: "美元/加元", exchange: "FX", type: "外汇", aliases: ["加元", "cad", "usdcad"] },
  { symbol: "USDCHF=X", name: "美元/瑞郎", exchange: "FX", type: "外汇", aliases: ["瑞郎", "瑞士法郎", "chf", "usdchf"] },
  { symbol: "NZDUSD=X", name: "纽元/美元", exchange: "FX", type: "外汇", aliases: ["纽元", "新西兰元", "nzd", "nzdusd"] },

  // ---------------- 债券 / 利率 ----------------
  { symbol: "^TNX", name: "美国 10 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "美国国债", "10年", "十年期", "国债收益率", "tnx", "收益率", "us10y"] },
  { symbol: "^TYX", name: "美国 30 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "30年", "三十年", "长债", "tyx", "us30y"] },
  { symbol: "^FVX", name: "美国 5 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "5年", "五年", "fvx", "us5y"] },
  { symbol: "^IRX", name: "美国 13 周国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "3月", "短债", "irx", "13周", "国库券"] },
  { symbol: "TLT", name: "iShares 20+ 年美债 ETF", exchange: "Nasdaq", type: "债券", aliases: ["长债etf", "美债etf", "tlt", "20年美债"] },
  { symbol: "IEF", name: "iShares 7-10 年美债 ETF", exchange: "Nasdaq", type: "债券", aliases: ["中债etf", "美债etf", "ief", "7-10年美债"] },
  { symbol: "SHY", name: "iShares 1-3 年美债 ETF", exchange: "Nasdaq", type: "债券", aliases: ["短债etf", "美债etf", "shy", "1-3年美债"] },

  // ---------------- 加密 ----------------
  { symbol: "BTC-USD", name: "比特币", exchange: "Crypto", type: "加密", aliases: ["比特币", "btc", "bitcoin"] },
  { symbol: "ETH-USD", name: "以太坊", exchange: "Crypto", type: "加密", aliases: ["以太坊", "以太", "eth", "ethereum"] },
];

let byUpperSymbol: Map<string, MarketInstrument> | null = null;

/** 按 symbol（大写）取白名单条目 */
export function findMarketInstrument(symbol: string): MarketInstrument | null {
  if (!byUpperSymbol) {
    byUpperSymbol = new Map(MARKET_INSTRUMENTS.map((m) => [m.symbol.toUpperCase(), m]));
  }
  return byUpperSymbol.get(symbol.trim().toUpperCase()) ?? null;
}

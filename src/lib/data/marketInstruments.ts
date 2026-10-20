/**
 * 大宗商品 / 外汇 / 债券利率 / 加密 的检索白名单（Yahoo Finance 代码）。
 *
 * 这些标的 SEC company_tickers 不收录，故行情页联想此前只能搜到美股/ETF。
 * K 线引擎（yahooKlineProvider → getAdjustedDailyBars → 远端回补）本就能按 Yahoo
 * 代码取数，缺的只是「可被搜到」。此表提供中英文别名，接入 usEquitySearch 后即可检索。
 *
 * 代码均已对 Yahoo v8 chart API 校验可返回 1d 数据。
 */

export type MarketInstrumentType = "商品" | "外汇" | "债券" | "加密" | "指数";

export type MarketInstrument = {
  symbol: string;
  /** 常用展示代码，同时允许直接输入；底层仍使用 symbol 请求行情。 */
  displaySymbol?: string;
  /** 无歧义的可直接输入代码；自然语言关键词仅参与搜索，不自动转换。 */
  inputAliases?: string[];
  /** 复用宏观底座的日度收益率，不能当作盘中 OHLC。 */
  fredSeriesId?: string;
  /** 中文主名 */
  name: string;
  /** 交易所 / 市场 */
  exchange: string;
  type: MarketInstrumentType;
  /** 检索别名（中英文、常用简写） */
  aliases: string[];
};

export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  // ---------------- 股指 ----------------
  { symbol: "^GSPC", displaySymbol: "SPX", inputAliases: ["SP500", "SPX500", "US500"], name: "标普500指数", exchange: "S&P", type: "指数", aliases: ["标普", "标普500", "S&P 500", "SPX", "SP500", "SPX500", "US500"] },
  { symbol: "^NDX", displaySymbol: "NDX", inputAliases: ["NAS100", "NASDAQ100", "US100"], name: "纳斯达克100指数", exchange: "Nasdaq", type: "指数", aliases: ["纳指100", "纳斯达克100", "Nasdaq 100", "NDX", "NAS100", "NASDAQ100", "US100"] },
  { symbol: "^IXIC", displaySymbol: "IXIC", inputAliases: ["NASDAQ"], name: "纳斯达克综合指数", exchange: "Nasdaq", type: "指数", aliases: ["纳指", "纳斯达克", "纳斯达克综合指数", "Nasdaq Composite", "IXIC", "NASDAQ"] },
  { symbol: "^DJI", displaySymbol: "DJI", inputAliases: ["DJIA", "US30"], name: "道琼斯工业指数", exchange: "Dow Jones", type: "指数", aliases: ["道指", "道琼斯", "Dow Jones", "DJI", "DJIA", "US30"] },
  { symbol: "^RUT", displaySymbol: "RUT", inputAliases: ["RUSSELL2000", "US2000"], name: "罗素2000指数", exchange: "FTSE Russell", type: "指数", aliases: ["罗素", "罗素2000", "Russell 2000", "RUT", "US2000"] },
  { symbol: "^VIX", displaySymbol: "VIX", name: "CBOE波动率指数", exchange: "CBOE", type: "指数", aliases: ["VIX", "恐慌指数", "波动率指数"] },
  { symbol: "^HSI", displaySymbol: "HSI", name: "恒生指数", exchange: "HKEX", type: "指数", aliases: ["HSI", "恒指", "恒生", "Hang Seng"] },
  { symbol: "^N225", displaySymbol: "N225", inputAliases: ["NK225", "NIKKEI225"], name: "日经225指数", exchange: "Osaka", type: "指数", aliases: ["N225", "NK225", "NIKKEI225", "日经", "日经225"] },
  { symbol: "^GDAXI", displaySymbol: "DAX40", inputAliases: ["DE40", "GER40", "TVC:DAX"], name: "德国DAX指数", exchange: "Xetra", type: "指数", aliases: ["DAX", "DAX40", "DE40", "GER40", "德国指数", "德国DAX"] },
  { symbol: "^FTSE", displaySymbol: "FTSE", inputAliases: ["UK100", "FTSE100"], name: "英国富时100指数", exchange: "FTSE", type: "指数", aliases: ["FTSE", "FTSE100", "UK100", "富时100", "英国富时"] },
  // ---------------- 大宗商品 ----------------
  { symbol: "XAUUSD", name: "现货黄金（美元/盎司）", exchange: "现货", type: "商品", aliases: ["黄金", "现货黄金", "伦敦金", "gold", "xau", "xau/usd", "xauusd=x"] },
  { symbol: "GC=F", name: "COMEX黄金期货", exchange: "COMEX", type: "商品", aliases: ["黄金期货", "黄金", "金", "gold futures", "au"] },
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
  { symbol: "DX-Y.NYB", displaySymbol: "DXY", inputAliases: ["USDX"], name: "美元指数", exchange: "ICE", type: "外汇", aliases: ["美元指数", "美指", "dxy", "dollar index", "usdx"] },
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
  { symbol: "^TNX", displaySymbol: "US10Y", inputAliases: ["US10YR", "US10YT", "USGG10YR"], name: "美国 10 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "美国国债", "10年", "十年期", "国债收益率", "tnx", "收益率", "us10y", "US10YR", "US10YT", "USGG10YR"] },
  { symbol: "^TYX", displaySymbol: "US30Y", inputAliases: ["US30YR", "US30YT"], name: "美国 30 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "30年", "三十年", "长债", "tyx", "us30y", "US30YR", "US30YT"] },
  { symbol: "^FVX", displaySymbol: "US5Y", inputAliases: ["US05Y", "US5YR", "US05YT"], name: "美国 5 年期国债收益率", exchange: "CBOE", type: "债券", aliases: ["美债", "5年", "五年", "五年期", "fvx", "us5y", "US05Y", "US5YR", "US05YT"] },
  ...([
    ["US1M", "DGS1MO", "1个月", "一个月"], ["US3M", "DGS3MO", "3个月", "三个月"],
    ["US6M", "DGS6MO", "6个月", "六个月"], ["US1Y", "DGS1", "1年", "一年"],
    ["US2Y", "DGS2", "2年", "两年"], ["US3Y", "DGS3", "3年", "三年"],
    ["US7Y", "DGS7", "7年", "七年"], ["US20Y", "DGS20", "20年", "二十年"],
  ].map(([symbol, fredSeriesId, term, chinese]): MarketInstrument => {
    const inputAliases = [symbol.replace("US", "US0"), `${symbol}R`, `${symbol}T`, `${symbol.replace("US", "US0")}T`, symbol.replace("US", "USGG") + "R", fredSeriesId];
    return { symbol, displaySymbol: symbol, inputAliases, fredSeriesId,
      name: `美国${term}期国债收益率（日度）`, exchange: "FRED / H.15", type: "债券",
      aliases: [symbol, ...inputAliases, fredSeriesId, `美债${term}`, `${term}美债`, `${term}国债`, `${term}期国债`, `${chinese}期`, `${chinese}期国债`, `美国${term}期国债收益率`, "美债", "美国国债", "收益率"] };
  })),
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

export function marketSymbolLabel(symbol: string): string {
  const item = findMarketInstrument(symbol);
  if (!item) return symbol;
  return item.displaySymbol ?? (item.symbol.endsWith("=X") ? item.symbol.slice(0, -2)
    : item.symbol.endsWith("=F") ? item.symbol.slice(0, -2) + "1!"
    : item.type === "加密" ? item.symbol.replace("-", "") : item.symbol);
}

/** 可直接输入的代码集中定义，禁止把 GOLD、CL、BTC 等真实股票/ETF代码作为模糊别名吞掉。 */
export function marketInstrumentInputCodes(item: MarketInstrument): string[] {
  return [item.symbol, item.displaySymbol, ...(item.inputAliases ?? []),
    ...(item.symbol.endsWith("=X") ? [item.symbol.slice(0, -2), item.symbol.slice(0, 3) + "/" + item.symbol.slice(3, 6)] : []),
    ...(item.symbol.endsWith("=F") ? [item.symbol.slice(0, -2) + "1!"] : []),
    ...(item.type === "加密" ? [item.symbol.replace("-", ""), item.symbol.replace("-", "/")] : []),
  ].filter((code): code is string => Boolean(code));
}

const inputCodeMap = new Map(MARKET_INSTRUMENTS.flatMap(item =>
  marketInstrumentInputCodes(item).map(code => [code.toUpperCase(), item] as const)));

export function resolveMarketInstrumentInput(raw: string): MarketInstrument | null {
  return inputCodeMap.get(raw.trim().replace(/\s+/g, "").toUpperCase()) ?? null;
}

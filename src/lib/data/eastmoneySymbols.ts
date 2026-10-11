/** Canonical symbols keep mainland/HK codes separate from US tickers and each other. */
export type EastmoneyInstrument = {
  symbol: string;
  secid: string;
  market: "SH" | "SZ" | "BJ" | "HK" | "GOLD";
  currency: "CNY" | "USD" | "HKD";
};

export function resolveEastmoneyInstrument(raw: string): EastmoneyInstrument | null {
  let symbol = raw.trim().replace(/\s+/g, "").toUpperCase();
  if (["XAUUSD", "XAU/USD", "XAUUSD=X", "122.XAU"].includes(symbol)) {
    return { symbol: "XAUUSD", secid: "122.XAU", market: "GOLD", currency: "USD" };
  }
  const prefix = symbol.match(/^(SH|SZ|BJ|HK)(\d{5,6})$/);
  if (prefix) symbol = `${prefix[2]}.${prefix[1]}`;
  if (/^\d{5}$/.test(symbol)) symbol += ".HK";
  if (/^\d{6}$/.test(symbol)) {
    const market = /^(4|8|92)/.test(symbol) ? "BJ" : /^[569]/.test(symbol) ? "SH" : "SZ";
    symbol += `.${market}`;
  }
  const match = symbol.match(/^(\d{5,6})\.(SH|SZ|BJ|HK)$/);
  if (!match) return null;
  const [, code, market] = match;
  if ((market === "HK" && code.length !== 5) || (market !== "HK" && code.length !== 6)) return null;
  const id = market === "HK" ? "116" : market === "SH" ? "1" : "0";
  // HKEX RMB counters use 8xxxx; USD ETF counters use 09xxx.
  const currency = market === "HK" ? code.startsWith("8") ? "CNY" : code.startsWith("09") ? "USD" : "HKD"
    : market === "SZ" && code.startsWith("200") ? "HKD"
    : market === "SH" && code.startsWith("900") ? "USD" : "CNY";
  return { symbol, secid: `${id}.${code}`, market: market as EastmoneyInstrument["market"], currency };
}

export function eastmoneySymbolFromSuggestion(code: string, quoteId: string, type = ""): string | null {
  if (quoteId === "122.XAU") return "XAUUSD";
  if (!/^\d+$/.test(code)) return null;
  const market = quoteId.split(".")[0];
  if (quoteId !== `${market}.${code}`) return null;
  if (market === "116" && code.length === 5) return `${code}.HK`;
  if (code.length !== 6 || !["0", "1"].includes(market)) return null;
  return `${code}.${market === "1" ? "SH" : type.includes("京") || /^(4|8|92)/.test(code) ? "BJ" : "SZ"}`;
}

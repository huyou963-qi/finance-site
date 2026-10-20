export type MarketQuote = {
  symbol: string;
  price: number;
  changePercent: number | null;
  time: number | null;
  currency: string | null;
};

/** 缺失值不当作零；涨跌幅始终以供应商昨收为基准。 */
export function makeMarketQuote(symbol: string, raw: {
  price?: unknown; previousClose?: unknown; time?: unknown; currency?: unknown;
}): MarketQuote | null {
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const price = number(raw.price);
  if (price === null || price <= 0) return null;
  const previousClose = number(raw.previousClose);
  const time = number(raw.time);
  return {
    symbol,
    price,
    changePercent: previousClose !== null && previousClose > 0 ? (price / previousClose - 1) * 100 : null,
    time: time !== null && time > 0 ? time : null,
    currency: typeof raw.currency === "string" ? raw.currency : null,
  };
}

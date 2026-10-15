import { resolveEastmoneyInstrument } from "./eastmoneySymbols";
import { resolveMarketInstrumentInput } from "./marketInstruments";

/** 规范化输入框中的标的代码（去空格、常见后缀与指数前缀的大写规则） */
export function normalizeTickerSymbol(raw: string): string {
  const input = raw.trim().replace(/\s+/g, "");
  // A stock-exchange-qualified ticker must not turn into a macro asset alias.
  const stock = /^(?:NASDAQ|NYSE|AMEX):(.+)$/i.exec(input);
  if (stock) return stock[1].toUpperCase();
  const qualified = resolveMarketInstrumentInput(input);
  if (qualified) return qualified.symbol;
  const s = input.replace(/^(?:TVC|INDEX|CBOE|FX|FX_IDC|OANDA|BINANCE|FRED|COMEX|NYMEX|CME|CBOT|ICE):/i, "");
  if (!s) return s;
  const common = resolveMarketInstrumentInput(s);
  if (common) return common.symbol;
  const regional = resolveEastmoneyInstrument(s);
  if (regional) return regional.symbol;
  if (s.includes("=")) return s.toUpperCase();
  if (s.startsWith("^")) return `^${s.slice(1).toUpperCase()}`;
  return s.toUpperCase();
}

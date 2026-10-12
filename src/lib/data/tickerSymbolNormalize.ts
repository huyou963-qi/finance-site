import { resolveEastmoneyInstrument } from "./eastmoneySymbols";

/** 规范化输入框中的标的代码（去空格、常见后缀与指数前缀的大写规则） */
export function normalizeTickerSymbol(raw: string): string {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return s;
  const regional = resolveEastmoneyInstrument(s);
  if (regional) return regional.symbol;
  if (s.includes("=")) return s.toUpperCase();
  if (s.startsWith("^")) return `^${s.slice(1).toUpperCase()}`;
  return s.toUpperCase();
}

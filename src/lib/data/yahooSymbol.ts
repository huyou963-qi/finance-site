/** 规范化用户在输入框里的符号，便于 Yahoo chart/search 命中正确标的 */
export function normalizeYahooSymbol(raw: string): string {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return s;
  // 常见指数 ^GSPC、外汇/贵金属后缀 =X、连续合约 =F 等保持结构，仅做大写
  if (s.includes("=")) return s.toUpperCase();
  if (s.startsWith("^")) return `^${s.slice(1).toUpperCase()}`;
  // 美股类 BRK.B；加密 BTC-USD 等：整体大写即可
  return s.toUpperCase();
}

/** Flex / HTML 导入成交用的标的规范化 */
export function normalizeFlexSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return "";
  const first = s.split(/\s+/)[0] ?? s;
  return first.replace(/^=/, "");
}

import { normalizeFlexSymbol } from "@/lib/chart/flexSymbolNormalize";

/**
 * 从 IBKR 类期货代码尾部剥离交割月：ROOT + 月代码(FGHJKMNQUVXZ) + 年(1–4 位)。
 * 连续合约图表符号（…=F）、外汇对等不匹配则返回 null。
 */
export function futuresContractRoot(contractSymbol: string): string | null {
  const u =
    normalizeFlexSymbol(contractSymbol).split(/\s+/)[0]?.trim() ?? "";
  if (!u) return null;
  if (/=F$/i.test(u)) return null;

  const tail = u.match(/([FGHJKMNQUVXZ])(\d{1,4})$/i);
  if (!tail || !tail[0]) return null;
  const root = u.slice(0, -tail[0].length);
  if (root.length < 2 || root.length > 12) return null;
  if (!/^[A-Z0-9.]+$/i.test(root)) return null;
  return root.toUpperCase();
}

/**
 * 将「图表代码」或「成交代码」映射到同一键，用于 K 线成交叠加筛选：
 * - 连续期货：`ROOT=F`（如 `MCL=F` / `MES=F`）
 * - 具体期货合约：`MCLJ6` → `MCL=F`，与连续图合并
 * - 其它（股票、外汇、贵金属现货代码等）：`normalizeFlexSymbol` 原样
 */
export function executionSymbolMatchKey(raw: string): string {
  const n = normalizeFlexSymbol(raw);
  if (!n) return "";
  if (/=F$/i.test(n)) return n.toUpperCase();

  const root = futuresContractRoot(n);
  if (root) return `${root}=F`;

  return n;
}

import type { SymbolSearchItem } from "@/lib/data/symbolSearchTypes";

/** 取主代码段，便于与输入比较（如 BRK.B → BRK） */
function symbolBase(sym: string): string {
  const cut = sym.split(/[.\-]/)[0];
  return (cut ?? sym).toUpperCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 名称中是否以「独立词」形式出现查询串（避免 meta 命中 metals、metallic 等子串）。
 */
function nameHasWholeWord(name: string, q: string): boolean {
  const ql = q.trim();
  if (!ql) return false;
  const re = new RegExp(
    `(^|[^a-zA-Z0-9])${escapeRegex(ql)}([^a-zA-Z0-9]|$)`,
    "i",
  );
  return re.test(name);
}

/**
 * 名称子串命中且前后为词界（整词或独立片段），排除 meta 仅作为 metals / metamorphic 等词内部前缀。
 */
function nameHasAcceptableSubstringMatch(name: string, q: string): boolean {
  const nl = name.toLowerCase();
  const ql = q.trim().toLowerCase();
  if (!ql) return false;
  let from = 0;
  while (from <= nl.length - ql.length) {
    const idx = nl.indexOf(ql, from);
    if (idx === -1) return false;
    const before = idx === 0 ? " " : nl[idx - 1]!;
    const after =
      idx + ql.length >= nl.length ? " " : nl[idx + ql.length]!;
    const beforeOk = !/[a-z0-9]/i.test(before);
    const afterOk = !/[a-z0-9]/i.test(after);
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
  return false;
}

/** 同档内二级排序：代码与查询越接近越靠前，避免纯按字母序把 AB… 全排在前面 */
function symbolAffinity(symbol: string, qu: string): number {
  const s = symbol.toUpperCase();
  const b = symbolBase(s);
  if (b === qu || s === qu) return 10_000;
  if (b.startsWith(qu) || s.startsWith(qu)) return 5000 - Math.min(s.length, 30);
  if (s.includes(qu) || b.includes(qu)) return 2000;
  return 0;
}

/**
 * 对联想结果重排：优先精确/前缀 ticker，再考虑名称整词匹配，弱子串匹配垫底。
 * 解决输入 META 时 Yahoo 把「*METALS*」名称匹配排在真正的 META 之前、且截断列表丢失 META 的问题。
 */
export function rankSymbolSearchHits(
  q: string,
  items: SymbolSearchItem[],
): SymbolSearchItem[] {
  const qu = q.trim().toUpperCase();
  const qTrim = q.trim();
  if (!qu) return items;
  const ql = qTrim.toLowerCase();

  function tier(item: SymbolSearchItem): number {
    const sym = item.symbol.toUpperCase();
    const base = symbolBase(sym);
    if (base === qu || sym === qu) return 0;
    if (base.startsWith(qu) || sym.startsWith(qu)) return 1;
    if (sym.includes(qu) || base.includes(qu)) return 2;
    if (nameHasWholeWord(item.name, qTrim)) return 3;
    if (nameHasAcceptableSubstringMatch(item.name, qTrim)) return 4;
    /** 仅剩「meta」嵌在 metals 等词内部的名称命中，排序垫底 */
    if (item.name.toLowerCase().includes(ql)) return 8;
    return 9;
  }

  return [...items].sort((a, b) => {
    const d = tier(a) - tier(b);
    if (d !== 0) return d;
    const da = symbolAffinity(a.symbol, qu) - symbolAffinity(b.symbol, qu);
    if (da !== 0) return -da;
    return a.symbol.localeCompare(b.symbol);
  });
}

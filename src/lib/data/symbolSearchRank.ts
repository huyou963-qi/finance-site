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
 * 对联想结果重排：优先精确/前缀 ticker，再考虑名称整词匹配，弱子串匹配垫底。
 * 解决输入 META 时 Yahoo 把「*METALS*」名称匹配排在真正的 META 之前、且截断列表丢失 META 的问题。
 */
export function rankSymbolSearchHits(
  q: string,
  items: SymbolSearchItem[],
): SymbolSearchItem[] {
  const qu = q.trim().toUpperCase();
  if (!qu) return items;

  function tier(item: SymbolSearchItem): number {
    const sym = item.symbol.toUpperCase();
    const base = symbolBase(sym);
    if (base === qu || sym === qu) return 0;
    if (base.startsWith(qu) || sym.startsWith(qu)) return 1;
    if (sym.includes(qu) || base.includes(qu)) return 2;
    if (nameHasWholeWord(item.name, q.trim())) return 3;
    if (item.name.toLowerCase().includes(q.trim().toLowerCase())) return 4;
    return 5;
  }

  return [...items].sort((a, b) => {
    const d = tier(a) - tier(b);
    if (d !== 0) return d;
    return a.symbol.localeCompare(b.symbol);
  });
}

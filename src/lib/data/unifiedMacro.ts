import type { MacroPayload } from "./types";
import { fetchFredSeriesMultiple } from "./fred";

/** 统一宏观：数据源为 FRED（见 `fred.ts`） */
export async function fetchUnifiedMacro(
  selectionKeys: string[],
  allowlist?: Set<string>,
): Promise<MacroPayload> {
  const keys = [...new Set(selectionKeys)]
    .filter((k) => {
      if (!k.startsWith("fred:")) return false;
      if (allowlist && allowlist.size > 0) return allowlist.has(k);
      return true;
    })
    .slice(0, 20);
  const ids = keys.map((k) => k.slice(5)).filter(Boolean);
  if (ids.length === 0) {
    throw new Error("至少选择一条 FRED 指标");
  }
  const payload = await fetchFredSeriesMultiple(ids);
  const keyedSeries = payload.series.map((s) => {
    const m = /\(([A-Z0-9._-]+)\)\s*$/.exec(s.name);
    const id = m?.[1];
    return { ...s, key: id ? `fred:${id}` : s.key };
  });
  return {
    ...payload,
    title: `宏观数据（${keyedSeries.length} 条 · FRED）`,
    source: "unified",
    series: keyedSeries,
    attribution: "数据来自 FRED（St. Louis Fed）。",
  };
}

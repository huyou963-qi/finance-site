import type { LocalEventPack } from "@/lib/equity/useLocalCompanyEvents";
import type { EventSourceGroup, selectChartEvents } from "./eventSelection";
import type { EventSourceFilters } from "./eventViewFilters";

export function summarizeEventPacks(packs: LocalEventPack[], symbol: string) {
  const enabled = packs.filter(p => p.enabled);
  const applicable = enabled.filter(p => p.target === "all-assets" || p.symbols?.includes(symbol.trim().toUpperCase()));
  return { total: packs.length, disabled: packs.length - enabled.length, notApplicable: enabled.length - applicable.length, applicable: applicable.length };
}

export function describeEmptyEventState({ source, filters, stats, loading, error, ready, packs, symbol }: {
  source: EventSourceGroup; filters: EventSourceFilters;
  stats: ReturnType<typeof selectChartEvents>["sourceStats"]["system"];
  loading: boolean; error: string | null; ready: boolean; packs: ReturnType<typeof summarizeEventPacks>; symbol: string;
}): { message: string; action: "retry" | "manage" | "clear" | "diagnostics" | null } {
  if (!symbol.trim()) return { message: "请先选择资产。", action: null };
  if (source === "user" && !ready) return { message: "正在加载当前账号的事件包…", action: null };
  if (source === "system" ? !filters.includeMarket && !filters.includeSec : filters.includeLocal === false) return { message: "本类事件来源已关闭，可在设置中启用。", action: "manage" };
  if (loading) return { message: "正在加载系统事件，结果尚未确定…", action: null };
  if (error) return { message: "系统事件加载失败，不能据此判断没有事件。用户事件仍可查看。", action: "retry" };
  if (source === "user") {
    if (!packs.total) return { message: "尚未导入事件文件。", action: "manage" };
    if (packs.disabled === packs.total) return { message: "所有用户事件包均已停用。", action: "manage" };
    if (!packs.applicable) return { message: "已启用的事件包不适用于当前资产。", action: "manage" };
  }
  if (stats.loaded && !stats.inRange) return { message: "已加载事件均在当前图表时间区间外，请调整 K 线时间区间。", action: "diagnostics" };
  if (stats.filteredOut) return { message: `当前区间内 ${stats.inRange} 条事件均被筛选条件排除。`, action: "diagnostics" };
  if (source === "system" && (filters.countries.length || filters.industries.length || filters.assets.length)) return { message: "当前资产、关联范围及服务端标签条件下未加载到事件；可清除内容条件后重查。", action: "clear" };
  return { message: source === "system" ? "当前查询未加载到相关事件；可检查关联范围。此结果不代表完整历史覆盖。" : "适用事件包中未加载到可用事件，请检查事件包内容。", action: "manage" };
}

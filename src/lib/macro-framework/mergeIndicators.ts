import type { MacroIndicator } from "./types";
import type { FrameworkIndicatorSnapshot } from "./fetchIndicatorsFromDb";

/** 将静态指标元数据与库中观测快照合并；缺失数据显示 N/A。 */
export function mergeFrameworkIndicators(
  base: MacroIndicator[],
  live: Record<string, FrameworkIndicatorSnapshot>,
): MacroIndicator[] {
  return base.map((ind) => {
    const snap = live[ind.id];
    if (!snap || snap.value === null) {
      return {
        ...ind,
        value: null,
        prevValue: null,
        asOfDate: snap?.asOfDate ?? "—",
        sparkline: snap?.sparkline ?? [],
      };
    }
    return {
      ...ind,
      value: snap.value,
      prevValue: snap.prevValue,
      asOfDate: snap.asOfDate ?? ind.asOfDate,
      sparkline: snap.sparkline.length > 0 ? snap.sparkline : ind.sparkline,
    };
  });
}

export function indicatorsById(items: MacroIndicator[]): Record<string, MacroIndicator> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

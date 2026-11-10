/**
 * 数据文案（指标名、目录、模板名等）的英文展示（纯函数，有单测）。
 *
 * 数据里有英文名（如 Instrument.nameEn）时优先用它；没有时按功能页词典翻译中文；都没有就显示中文。
 * 只改「显示用」字段：目录的分类/国家名在 catalogTree 里参与逻辑匹配，保持中文，只在显示处翻译。
 */
import type { UnifiedCatalogCountry } from "@/lib/data/fredCatalog";
import type { MacroPayload } from "@/lib/data/types";

/** (中文, 英文?) → 当前语言下要显示的文字 */
export type PickLabel = (zh: string, en?: string | null) => string;

export function makePickLabel(locale: string, translate: (zh: string) => string): PickLabel {
  return (zh, en) => (locale === "en" ? en?.trim() || translateComposite(zh, translate) : zh);
}

/** 整句没有译文时，按「 · 」拆开逐段翻译（如「美国 · 实际 GDP」由前端拼出的组合名） */
export function translateComposite(zh: string, translate: (zh: string) => string): string {
  const whole = translate(zh);
  if (whole !== zh || !zh.includes(" · ")) return whole;
  return zh
    .split(" · ")
    .map((part) => translate(part))
    .join(" · ");
}

/** 目录里每个指标的显示名换成当前语言（key、分类名不变） */
export function localizeCatalogItems(
  countries: UnifiedCatalogCountry[],
  pick: PickLabel,
): UnifiedCatalogCountry[] {
  const item = <T extends { label: string; labelEn?: string }>(i: T): T => ({ ...i, label: pick(i.label, i.labelEn) });
  return countries.map((c) => ({
    ...c,
    categories: c.categories.map((g) => ({
      ...g,
      items: g.items.map(item),
      ...(g.subgroups ? { subgroups: g.subgroups.map((s) => ({ ...s, items: s.items.map(item) })) } : {}),
    })),
  }));
}

/** 图表数据里的序列名换成当前语言（key 不变） */
export function localizeMacroPayload(payload: MacroPayload, pick: PickLabel): MacroPayload {
  return { ...payload, series: payload.series.map((s) => ({ ...s, name: pick(s.name, s.nameEn) })) };
}

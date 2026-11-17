/**
 * 指标英文名（Instrument.nameEn）回填的纯逻辑（有单测）。脚本见 scripts/i18n/indicator-names.ts。
 */
import { translateComposite } from "@/i18n/dataLabels";

export type IndicatorNameRow = { code: string; name: string; displayName?: string | null; nameEn?: string | null };

/** 需要英文名的行：nameEn 为空 */
export function rowsMissingEnglish(rows: IndicatorNameRow[]): IndicatorNameRow[] {
  return rows.filter((r) => !r.nameEn?.trim());
}

export type NameUpdate = { code: string; nameEn: string; source: "dictionary" | "import" };

const CJK = /[㐀-鿿]/;

/**
 * 用词典回填英文名：先精确匹配 displayName / name，再对组合名（「 · 」「：」）分段翻译。
 * 分段结果若仍含汉字则跳过，避免把中英夹杂写进 nameEn。
 */
export function updatesFromDictionary(rows: IndicatorNameRow[], dict: Readonly<Record<string, string>>): NameUpdate[] {
  const translate = (zh: string) => dict[zh] ?? zh;
  const out: NameUpdate[] = [];
  for (const r of rowsMissingEnglish(rows)) {
    const candidates = [r.displayName?.trim(), r.name.trim()].filter((k): k is string => Boolean(k));
    let nameEn: string | undefined;
    for (const key of candidates) {
      const exact = dict[key]?.trim();
      if (exact && !CJK.test(exact)) {
        nameEn = exact;
        break;
      }
      const composite = translateComposite(key, translate).trim();
      if (composite && composite !== key && !CJK.test(composite)) {
        nameEn = composite;
        break;
      }
    }
    if (nameEn) out.push({ code: r.code, nameEn, source: "dictionary" });
  }
  return out;
}

/** 导入的 { code: 英文名 }；默认不覆盖已有英文名 */
export function updatesFromImport(
  rows: IndicatorNameRow[],
  imported: Readonly<Record<string, string>>,
  opts: { overwrite?: boolean } = {},
): NameUpdate[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const out: NameUpdate[] = [];
  for (const [code, raw] of Object.entries(imported)) {
    const nameEn = raw?.trim();
    const row = byCode.get(code);
    if (!row || !nameEn || nameEn.length > 512) continue;
    if (row.nameEn?.trim() && !opts.overwrite) continue;
    if (row.nameEn?.trim() === nameEn) continue;
    out.push({ code, nameEn, source: "import" });
  }
  return out;
}

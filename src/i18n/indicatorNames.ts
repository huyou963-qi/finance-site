/**
 * 指标英文名（Instrument.nameEn）回填的纯逻辑（有单测）。脚本见 scripts/i18n/indicator-names.ts。
 */

export type IndicatorNameRow = { code: string; name: string; displayName?: string | null; nameEn?: string | null };

/** 需要英文名的行：nameEn 为空 */
export function rowsMissingEnglish(rows: IndicatorNameRow[]): IndicatorNameRow[] {
  return rows.filter((r) => !r.nameEn?.trim());
}

export type NameUpdate = { code: string; nameEn: string; source: "dictionary" | "import" };

/** 用词典精确匹配中文名（优先 displayName，再 name） */
export function updatesFromDictionary(rows: IndicatorNameRow[], dict: Readonly<Record<string, string>>): NameUpdate[] {
  const out: NameUpdate[] = [];
  for (const r of rowsMissingEnglish(rows)) {
    const hit = [r.displayName?.trim(), r.name.trim()].map((k) => (k ? dict[k] : undefined)).find((v) => v?.trim());
    if (hit) out.push({ code: r.code, nameEn: hit.trim(), source: "dictionary" });
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

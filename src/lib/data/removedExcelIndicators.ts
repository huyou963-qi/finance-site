/** One-time imported indicators removed from the catalog and both databases. */
export const REMOVED_EXCEL_INDICATOR_CODES = [
  "jpov_c01_nikkei225",
  "jpov_c02_gdp_nominal",
  "jpov_c03_gdp_real_yoy_q",
  "jpov_c04_gdp_nom_yoy_q",
  "jpov_c05_boj_policy_rate",
  "jpov_c08_jgb_10y2y",
  "jpov_c09_cpi_yoy",
  "jpov_c10_cpi_mom",
  "jpov_c11_ppi_yoy",
  "jpov_c12_ppi_mom",
  "jpov_c13_economy_watch_outlook",
  "jpov_c14_economy_watch_current",
  "jpov_c16_base_money_yoy",
  "jpov_c17_m1_yoy",
  "jpov_c18_m2_yoy",
  "jpov_c19_boj_assets_total",
  "jpov_c20_boj_jgb_holdings",
  "jpov_c21_unrate_sa",
  "goldov_c01_comex_active",
  "goldov_c27_brent",
  "goldov_c02_london_gold",
  "usov_c05_comex_gold",
] as const;

const codes = new Set<string>(REMOVED_EXCEL_INDICATOR_CODES);

export function isRemovedExcelIndicatorKey(value: string): boolean {
  const base = value.split("::", 1)[0]!;
  return codes.has(base) || (base.startsWith("mds:") && codes.has(base.slice(4)));
}

/** Remove references from saved catalog layouts and chart preferences. */
export function removeExcelIndicatorReferences(value: unknown): unknown {
  if (typeof value === "string") return isRemovedExcelIndicatorKey(value) ? undefined : value;
  if (Array.isArray(value)) {
    return value.map(removeExcelIndicatorReferences).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  for (const field of ["key", "catalogKey", "instrumentCode", "leftKey", "rightKey"]) {
    if (typeof record[field] === "string" && isRemovedExcelIndicatorKey(record[field])) return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (isRemovedExcelIndicatorKey(key)) continue;
    const cleaned = removeExcelIndicatorReferences(item);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
}

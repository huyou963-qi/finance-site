/** Legacy h imports and the Japan Overview debt ratio permanently removed from mds. */
export const REMOVED_JAPAN_DEBT_CODE = "jpov_c22_public_debt_gdp";

export function isRemovedLegacyManualIndicatorKey(value: string): boolean {
  const base = value.split("::", 1)[0]!;
  const code = base.startsWith("mds:") ? base.slice(4) : base;
  return code === REMOVED_JAPAN_DEBT_CODE || /^m_[0-9a-f]{32}$/.test(code);
}

/** Remove catalog/chart references, including derived series and assignment keys. */
export function removeLegacyManualIndicatorReferences(value: unknown): unknown {
  if (typeof value === "string") return isRemovedLegacyManualIndicatorKey(value) ? undefined : value;
  if (Array.isArray(value)) return value.map(removeLegacyManualIndicatorReferences).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  for (const field of ["key", "catalogKey", "instrumentCode", "leftKey", "rightKey"]) {
    if (typeof record[field] === "string" && isRemovedLegacyManualIndicatorKey(record[field])) return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    if (isRemovedLegacyManualIndicatorKey(key)) continue;
    const cleaned = removeLegacyManualIndicatorReferences(item);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
}

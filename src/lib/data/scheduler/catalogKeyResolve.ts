import { wbInstrumentCode } from "@/lib/data/indicatorOnboarding";

/**
 * Map a unified catalog key to the local Instrument.code used by the scheduler.
 * FRED variants (`fred:CPIAUCSL::yoy`) resolve to the same underlying series.
 */
export function instrumentCodeForCatalogKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("mds:")) {
    const code = trimmed.slice(4).trim();
    return code || null;
  }

  if (trimmed.startsWith("fred:")) {
    const fredId = trimmed.slice(5).split("::")[0]?.trim().toUpperCase();
    return fredId ? `sched_fred_${fredId}` : null;
  }

  if (trimmed.startsWith("wb:")) {
    const parts = trimmed.split(":");
    if (parts.length < 3) return null;
    const country = parts[1]?.trim();
    const indicatorId = parts.slice(2).join(":").trim();
    if (!country || !indicatorId) return null;
    return wbInstrumentCode(country, indicatorId);
  }

  return null;
}

/** Inverse of `wbInstrumentCode` when the indicator id is known from WORLD_BANK_INDICATORS. */
export function parseSchedWbInstrumentCode(
  code: string,
  indicatorIds: readonly string[],
): { countryCode: string; indicatorId: string } | null {
  if (!code.startsWith("sched_wb_")) return null;
  const rest = code.slice("sched_wb_".length);
  const sorted = [...indicatorIds].sort((a, b) => b.length - a.length);
  for (const indicatorId of sorted) {
    const suffix = `_${indicatorId.replace(/\./g, "_")}`;
    if (!rest.endsWith(suffix)) continue;
    const countryCode = rest.slice(0, rest.length - suffix.length);
    if (!countryCode) continue;
    return { countryCode, indicatorId };
  }
  return null;
}

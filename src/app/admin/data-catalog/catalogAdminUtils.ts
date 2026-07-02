import type { AdminCatalogCountry, AdminCatalogIndicator } from "@/lib/data/scheduler/adminCatalog";

function pickPackageSyncLeaderCode(codes: string[]): string | null {
  if (!codes.length) return null;
  const headline = codes.find((c) => c.includes("_headline"));
  if (headline) return headline;
  return [...codes].sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function collectAllIndicators(countries: AdminCatalogCountry[]): AdminCatalogIndicator[] {
  const out: AdminCatalogIndicator[] = [];
  for (const country of countries) {
    for (const cat of country.categories) {
      out.push(...cat.indicators);
      for (const sg of cat.subgroups ?? []) out.push(...sg.indicators);
    }
  }
  return out;
}

export function buildPackageSyncLeaders(indicators: AdminCatalogIndicator[]): Set<string> {
  const byPkg = new Map<string, string[]>();
  for (const row of indicators) {
    if (!row.releasePackageId || !row.instrumentCode || !row.networkAcquisitionConfirmed) continue;
    const list = byPkg.get(row.releasePackageId) ?? [];
    list.push(row.instrumentCode);
    byPkg.set(row.releasePackageId, list);
  }
  const leaders = new Set<string>();
  for (const codes of byPkg.values()) {
    const leader = pickPackageSyncLeaderCode(codes);
    if (leader) leaders.add(leader);
  }
  return leaders;
}

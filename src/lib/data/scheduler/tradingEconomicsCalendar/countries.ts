/** ISO 3166-1 alpha-2 → TradingEconomics API country slug */
export const TE_COUNTRY_SLUG: Record<string, string> = {
  US: "united states",
  UK: "united kingdom",
  GB: "united kingdom",
  EU: "euro area",
  DE: "germany",
  FR: "france",
  JP: "japan",
  CN: "china",
  AU: "australia",
  CA: "canada",
  CH: "switzerland",
  IN: "india",
  BR: "brazil",
  KR: "south korea",
  MX: "mexico",
  IT: "italy",
  ES: "spain",
};

/** ISO 3166-1 alpha-2 → TE 日历页 `calendar-countries` Cookie（ISO-3166-1 alpha-3 小写） */
export const TE_CALENDAR_COUNTRY_COOKIE: Record<string, string> = {
  US: "usa",
  UK: "gbr",
  GB: "gbr",
  EU: "emu",
  DE: "deu",
  FR: "fra",
  JP: "jpn",
  CN: "chn",
  AU: "aus",
  CA: "can",
  CH: "che",
  IN: "ind",
  BR: "bra",
  KR: "kor",
  MX: "mex",
  IT: "ita",
  ES: "esp",
};

const SLUG_TO_ISO: Record<string, string> = {};
for (const [iso, slug] of Object.entries(TE_COUNTRY_SLUG)) {
  if (iso.length === 2) SLUG_TO_ISO[slug.toLowerCase()] = iso;
}

export function teCountrySlugsForCodes(codes: string[]): string[] {
  const slugs = new Set<string>();
  for (const c of codes) {
    const slug = TE_COUNTRY_SLUG[c.toUpperCase()];
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/** 订阅国家 ISO-2 → TE 日历 Cookie 值（逗号分隔多个） */
export function teCalendarCountryCookieValue(codes: string[]): string | null {
  const vals = new Set<string>();
  for (const c of codes) {
    const v = TE_CALENDAR_COUNTRY_COOKIE[c.toUpperCase()];
    if (v) vals.add(v);
  }
  return vals.size ? [...vals].join(",") : null;
}

export function isoFromTeCountryName(country: string): string | null {
  const key = country.trim().toLowerCase();
  return SLUG_TO_ISO[key] ?? null;
}

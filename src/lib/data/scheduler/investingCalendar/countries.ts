/** ISO 3166-1 alpha-2 → Investing.com economic-calendar country id */
export const INVESTING_COUNTRY_ID: Record<string, number> = {
  US: 5,
  UK: 4,
  EU: 72,
  DE: 17,
  FR: 22,
  JP: 35,
  CN: 37,
  AU: 25,
  CA: 6,
  CH: 12,
  IN: 14,
  BR: 32,
  KR: 11,
  MX: 27,
};

export function investingCountryIdsForCodes(codes: string[]): number[] {
  const ids = new Set<number>();
  for (const c of codes) {
    const id = INVESTING_COUNTRY_ID[c.toUpperCase()];
    if (id != null) ids.add(id);
  }
  return [...ids];
}

/** Investing 返回的旗帜/地区缩写 → ISO */
export const INVESTING_FLAG_TO_ISO: Record<string, string> = {
  USA: "US",
  US: "US",
  UK: "UK",
  GBP: "UK",
  EUR: "EU",
  EU: "EU",
  JPN: "JP",
  JP: "JP",
  CHN: "CN",
  CN: "CN",
  DEU: "DE",
  DE: "DE",
  AUS: "AU",
  CAN: "CA",
  CHE: "CH",
};

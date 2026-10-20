/** Preserve historical instruments and observations while fixing legacy geography. */
export function correctGoldEtfCountryMetadata(
  metadata: Record<string, unknown>,
  product: string,
): Record<string, unknown> {
  return product === "globalx-gold" ? { ...metadata, countryCode: "AU" } : { ...metadata };
}

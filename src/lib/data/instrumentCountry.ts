export function inferInstrumentCountryCode(instrument: { code: string; metadata: unknown }): string | null {
  const metadata = instrument.metadata && typeof instrument.metadata === "object"
    ? instrument.metadata as Record<string, unknown> : null;
  const country = metadata?.countryCode ?? metadata?.country;
  if (typeof country === "string" && country.trim()) return country.trim().toUpperCase().slice(0, 2);
  if (instrument.code.startsWith("chov_")) return "CN";
  if (instrument.code.startsWith("jpov_")) return "JP";
  const debtCountry = /^debtcap_(us|cn|jp|de)_/.exec(instrument.code)?.[1];
  if (debtCountry) return debtCountry.toUpperCase();
  if (["ism_", "sched_fred_", "usov_"].some(prefix => instrument.code.startsWith(prefix))) return "US";
  return null;
}

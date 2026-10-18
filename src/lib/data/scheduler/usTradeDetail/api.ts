/** Census-basis, NOT seasonally adjusted partner totals. Never route SA series here.
 * Official example uses CTY_CODE alone: omitted commodity/district/DF predicates
 * select the published partner total, not a sum of detailed commodity rows.
 */
export const CENSUS_TRADE_API = "https://api.census.gov/data/timeseries/intltrade";
const cache = new Map<string, { at: number; promise: Promise<unknown[][]> }>();

export function parseCensusPartnerApi(payload: unknown, country: string, side: "exports" | "imports", through: string) {
  if (!Array.isArray(payload) || payload.length < 2 || !Array.isArray(payload[0])) throw new Error("Census API returned no partner observations");
  const header = payload[0] as string[];
  const amount = side === "exports" ? "ALL_VAL_MO" : "GEN_VAL_MO";
  const columns = ["CTY_CODE", amount, "time"].map(name => header.indexOf(name));
  if (columns.some(index => index < 0)) throw new Error("Census API partner schema changed");
  const points = new Map<string, { obsDate: Date; value: number }>();
  for (const row of payload.slice(1)) {
    if (!Array.isArray(row) || row[columns[0]!] !== country) throw new Error("Census API returned an unexpected partner");
    const period = row[columns[2]!];
    const raw = row[columns[1]!];
    if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > through
      || typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      throw new Error("Census API returned an invalid period or monthly dollar value");
    }
    // API USD -> the existing workbook/database USD millions. Real zeros remain zeros.
    const value = Number(raw) / 1_000_000;
    if (points.has(period)) throw new Error("Census API returned duplicate partner periods");
    points.set(period, { obsDate: new Date(`${period}-01T00:00:00Z`), value });
  }
  return [...points.values()].sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
}

export async function fetchCensusPartnerApi(code: string, now = new Date()) {
  const match = /^census_us_trade_(exports|imports)_country_nsa_(\d{4})$/.exec(code);
  if (!match || Number(match[2]) < 1000 || Number(match[2]) >= 8000 || match[2] === "2771") {
    throw new Error("Census API routing requires an active unadjusted partner series");
  }
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key) throw new Error("CENSUS_API_KEY is required for Census partner API updates");
  const through = now.toISOString().slice(0, 7);
  const side = match[1] as "exports" | "imports";
  const table = await fetchPartnerTable(side, now, key);
  const countryIndex = table[0]!.indexOf("CTY_CODE");
  // One official release table is shared, but every member keeps an independent
  // country filter and parser/validation result. Omitted countries are failures,
  // not invented zero observations or borrowed world/regional totals.
  return parseCensusPartnerApi([table[0], ...table.slice(1).filter(row => row[countryIndex] === match[2])], match[2]!, side, through);
}

async function fetchPartnerTable(side: "exports" | "imports", now: Date, key: string): Promise<unknown[][]> {
  const through = now.toISOString().slice(0, 7);
  const cacheKey = `${side}:${through}`;
  const old = cache.get(cacheKey);
  if (old && Date.now() - old.at < 3_600_000) return old.promise;
  const promise = (async () => {
    const url = new URL(`${CENSUS_TRADE_API}/${side}/hs`);
    // Wider imports queries time out in production even when single-month
    // requests succeed. Bound the live worker to six calendar months; full
    // historical/annual revisions still require the official workbook route.
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().slice(0, 7);
    url.search = new URLSearchParams({
      get: `CTY_CODE,CTY_NAME,${side === "exports" ? "ALL_VAL_MO" : "GEN_VAL_MO"}`,
      time: `from ${from} to ${through}`,
      // With CTY_CODE in get and no country predicate, the official API returns
      // all partners (plus aggregates). CTY_CODE=* is NOT used.
      DISTRICT: "-",
      ...(side === "exports" ? { E_COMMODITY: "-", DF: "-" } : { I_COMMODITY: "-" }), key,
    }).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
      } catch {
        if (attempt === 0) continue;
        // Never propagate fetch errors/causes containing the credentialed URL.
        throw new Error("Census partner API network request failed after 2 attempts");
      }
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt === 0) continue;
      if (response.status !== 200) throw new Error(`Census partner API HTTP ${response.status}; no workbook/snapshot substitution`);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new Error("Census partner API response is not valid JSON"); }
      if (!Array.isArray(payload) || payload.length < 2 || !payload.every(Array.isArray)
        || !["CTY_CODE", "time", side === "exports" ? "ALL_VAL_MO" : "GEN_VAL_MO"].every(name => payload[0].includes(name))) {
        throw new Error("Census partner API release table schema changed");
      }
      return payload as unknown[][];
    }
    throw new Error("Census partner API attempts exhausted");
  })();
  cache.set(cacheKey, { at: Date.now(), promise });
  try { return await promise; } catch (error) { cache.delete(cacheKey); throw error; }
}

import assert from "node:assert/strict";
import test from "node:test";
import { fetchBtsTransportIncremental, parseBtsTransport } from "./btsTransportAdapter";
import { buildCassFreightIndexInstrumentMetadata, CASS_FREIGHT_INDEX_FRED_SERIES } from "../cassFreightIndexFredSeedCatalog";

const rows = [
  { obs_date: "2026-07-01T00:00:00", tsi_freight: "134.9", truck_d11: "113.2", rail_frt_carloads_d11: "993056", rail_frt_intermodal_d11: "1256914" },
  { obs_date: "2026-08-01T00:00:00", tsi_freight: "134.4", truck_d11: "112.8", rail_frt_carloads_d11: "990805", rail_frt_intermodal_d11: "1244306" },
];
test("BTS fields retain units, seasonal adjustment and exact source revisions", () => {
  for (const [series, latest] of [["TSIFRGHT", 134.4], ["TRUCKD11", 112.8], ["RAILFRTCARLOADSD11", 990805], ["RAILFRTINTERMODALD11", 1244306]] as const) {
    assert.equal(parseBtsTransport(rows, series).at(-1)!.value, latest);
    const item = CASS_FREIGHT_INDEX_FRED_SERIES.find(row => row.fredId === series)!;
    const metadata = buildCassFreightIndexInstrumentMetadata(item);
    assert.equal((metadata.scrape as { provider: string }).provider, "bts_transport");
    assert.equal(metadata.catalogKey, `fred:${series}`); // Existing charts retain their alias.
  }
  assert.throws(() => parseBtsTransport([{}], "TSIFRGHT"));
  assert.throws(() => parseBtsTransport([...rows, rows[0]], "TSIFRGHT"));
  assert.equal(parseBtsTransport([{ ...rows[0], obs_date: rows[0].obs_date + ".000" }], "TSIFRGHT")[0].value, 134.9);
  assert.throws(() => parseBtsTransport([{ ...rows[0], tsi_freight: "" }], "TSIFRGHT"));
  assert.equal(parseBtsTransport([rows[0], { obs_date: rows[1].obs_date }], "TSIFRGHT").length, 1);
});
test("BTS connector reads full official history and never conceals upstream failure", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "data.bts.gov");
      assert.equal(url.searchParams.has("$where"), false);
      return Response.json(rows);
    };
    const result = await fetchBtsTransportIncremental("TSIFRGHT");
    assert.equal(result.points[0].value, 134.9);
    assert.equal(result.sourceLatestObsDate!.toISOString(), "2026-08-01T00:00:00.000Z");
    globalThis.fetch = async () => new Response("blocked", { status: 403 });
    await assert.rejects(fetchBtsTransportIncremental("TSIFRGHT"), /HTTP 403/);
  } finally { globalThis.fetch = original; }
});

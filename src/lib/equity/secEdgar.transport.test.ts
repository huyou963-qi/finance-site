import test from "node:test";
import assert from "node:assert/strict";
import { fetchSecText, secTransportFailure } from "./secEdgar";

const url = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json";

test("socket resets are retried and HTTP 404 is not", () => {
  const reset = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
  assert.equal(secTransportFailure(reset).retry, true);
  assert.equal(secTransportFailure(reset).message, "fetch failed (ECONNRESET)");
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  assert.equal(secTransportFailure(timeout).timeout, true);
  assert.equal(secTransportFailure(new Error("SEC HTTP 404")).retry, false);
});

test("fetchSecText retries a dropped connection and stops on 404", async () => {
  let drops = 0;
  const dropped = await fetchSecText(url, 1000, async () => {
    if (++drops < 3) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    return new Response("ok", { status: 200 });
  });
  assert.equal(dropped, "ok");
  assert.equal(drops, 3);

  let timeouts = 0;
  await assert.rejects(() => fetchSecText(url, 1000, async () => {
    timeouts++;
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }), /aborted due to timeout/);
  assert.equal(timeouts, 2);

  let missing = 0;
  await assert.rejects(() => fetchSecText(url, 1000, async () => {
    missing++;
    return new Response("no", { status: 404 });
  }), /SEC HTTP 404/);
  assert.equal(missing, 1);

  let unavailable = 0;
  await assert.rejects(() => fetchSecText(url, 1000, async () => {
    unavailable++;
    return new Response("busy", { status: 503, headers: { "retry-after": "0" } });
  }), /SEC HTTP 503/);
  assert.equal(unavailable, 3);
});

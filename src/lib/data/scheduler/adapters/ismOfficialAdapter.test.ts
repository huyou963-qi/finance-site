import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { clearIsmOfficialAdapterCache, fetchIsmOfficialIncremental } from "./ismOfficialAdapter";
import { PR_NEWSWIRE_ISM_LIST_URL } from "../ismOfficial/catalog";
import { TE_ISM_PAGE_URL } from "../tradingEconomicsIndicator/ismCatalog";

const FIX = (name: string) =>
  path.join(__dirname, "..", "ismOfficial", "fixtures", name);

const SSO_REDIRECT = () =>
  new Response("", {
    status: 302,
    headers: { location: "https://ecommerce.ismworld.org/SSO/Login.aspx?DPLF=Y" },
  });

function mockFetch(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [needle, respond] of Object.entries(routes)) {
      if (url.includes(needle)) return respond();
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("falls back to PR Newswire (skipping TE) for a component TE never covered", async () => {
  const originalFetch = globalThis.fetch;
  const listHtml = fs.readFileSync(FIX("prnewswire-list.snippet.html"), "utf8");
  const reportHtml = fs.readFileSync(FIX("prnewswire-mfg-august-2026.snippet.html"), "utf8");
  globalThis.fetch = mockFetch({
    "ismworld.org": SSO_REDIRECT,
    [PR_NEWSWIRE_ISM_LIST_URL]: () => new Response(listHtml, { status: 200 }),
    "manufacturing-pmi-at-54-6-august-2026": () => new Response(reportHtml, { status: 200 }),
  });
  clearIsmOfficialAdapterCache();
  try {
    const result = await fetchIsmOfficialIncremental(
      {},
      "ism_us_ism_customers_inventories",
      "2020-01-01",
    );
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0]!.value, 42.8);
    assert.equal(result.points[0]!.obsDate.toISOString().slice(0, 10), "2026-08-01");
  } finally {
    globalThis.fetch = originalFetch;
    clearIsmOfficialAdapterCache();
  }
});

test("chains official -> PR Newswire -> TE and surfaces all three failures when every source is down", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch({
    "ismworld.org": SSO_REDIRECT,
    [PR_NEWSWIRE_ISM_LIST_URL]: () =>
      new Response("<html><body>no releases here</body></html>", { status: 200 }),
    [TE_ISM_PAGE_URL]: () => new Response("", { status: 500 }),
  });
  clearIsmOfficialAdapterCache();
  try {
    await assert.rejects(
      fetchIsmOfficialIncremental({}, "ism_us_ism_headline", "2020-01-01"),
      (err) => {
        const msg = String(err);
        assert.match(msg, /官网：/);
        assert.match(msg, /PR Newswire：/);
        assert.match(msg, /TE：/);
        assert.match(msg, /所有兜底均失败/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearIsmOfficialAdapterCache();
  }
});

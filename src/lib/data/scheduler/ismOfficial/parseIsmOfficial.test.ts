import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parseIsmOfficialCalendarPage, nextIsmOfficialRelease } from "./parseCalendar";
import { parseIsmOfficialReport } from "./parseReport";
import {
  clearIsmOfficialHtmlCache,
  fetchIsmOfficialHtml,
  looksLikeCaptchaInterstitial,
} from "./client";
import { convertTePageToIsmReport } from "../adapters/ismOfficialAdapter";
import { loadPublishedIsmOfficialReleases } from "./publishedCalendar";

const FIX = (name: string) => path.join(__dirname, "fixtures", name);

test("parse ISM official 2026 calendar table", () => {
  const html = fs.readFileSync(FIX("calendar-2026.snippet.html"), "utf8");
  const releases = parseIsmOfficialCalendarPage(html);
  const mfg = releases.filter((r) => r.kind === "manufacturing");
  const svc = releases.filter((r) => r.kind === "services");
  assert.equal(mfg.length, 12);
  assert.equal(svc.length, 12);

  const janMfg = mfg.find((r) => r.releaseMonth === 1)!;
  assert.equal(janMfg.releaseDay, 5);
  assert.equal(janMfg.releaseAt.toISOString(), "2026-01-05T15:00:00.000Z");

  const augMfg = mfg.find((r) => r.releaseMonth === 8)!;
  assert.equal(augMfg.releaseDay, 3);
  assert.equal(augMfg.releaseAt.toISOString(), "2026-08-03T14:00:00.000Z");

  const julSvc = svc.find((r) => r.releaseMonth === 7)!;
  assert.equal(julSvc.releaseDay, 6);

  const afterAug3 = nextIsmOfficialRelease(
    releases,
    "manufacturing",
    new Date("2026-08-03T14:05:00.000Z"),
  );
  assert.equal(afterAug3?.releaseMonth, 9);
  assert.equal(afterAug3?.releaseDay, 1);
});

test("parse manufacturing at-a-glance including extra components", () => {
  const html = fs.readFileSync(FIX("mfg-july-2026.snippet.html"), "utf8");
  const parsed = parseIsmOfficialReport(html, "manufacturing");
  assert.equal(parsed.obsDate.toISOString().slice(0, 10), "2026-07-01");
  assert.equal(parsed.pointsByCode.get("ism_us_ism_headline")?.value, 55.6);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_orders")?.value, 56.7);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_customers_inventories")?.value, 40.7);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_export_orders")?.value, 53.0);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_imports")?.value, 55.7);
  assert.equal(parsed.pointsByCode.size, 11);
});

test("parse services at-a-glance using first numeric column", () => {
  const html = fs.readFileSync(FIX("svc-july-2026.snippet.html"), "utf8");
  const parsed = parseIsmOfficialReport(html, "services");
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_headline")?.value, 54.1);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_business_activity")?.value, 59.1);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_supplier_deliveries")?.value, 52.8);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_inventory_sentiment")?.value, 52.5);
  assert.equal(parsed.pointsByCode.get("ism_svc_us_svc_new_export_orders")?.value, 52.0);
  assert.notEqual(parsed.pointsByCode.get("ism_svc_us_svc_headline")?.value, 55.6);
});

test("missing glance table throws", () => {
  assert.throws(
    () => parseIsmOfficialReport("<html><p>hello</p></html>", "manufacturing"),
    /无法从标题解析|未找到/,
  );
});

test("published 2026 calendar loads as a bundled scheduler fallback", () => {
  const releases = loadPublishedIsmOfficialReleases();
  assert.equal(releases.filter((r) => r.kind === "manufacturing").length, 12);
  assert.equal(releases.filter((r) => r.kind === "services").length, 12);
  const nextM = nextIsmOfficialRelease(
    releases,
    "manufacturing",
    new Date("2026-08-03T14:05:00.000Z"),
  );
  assert.equal(nextM?.releaseDay, 1);
  assert.equal(nextM?.releaseMonth, 9);
});

test("detects ISM reCAPTCHA interstitial", () => {
  const html =
    '<form name="captcha_form" action="/captcha_resp"></form><script src="https://www.google.com/recaptcha/api.js?render=abc"></script>';
  assert.equal(looksLikeCaptchaInterstitial(html), true);
  assert.equal(looksLikeCaptchaInterstitial("<table><tr><td>January 2026</td></tr></table>"), false);
});

test("reports ISM SSO redirect without following the CAPTCHA page", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("", {
      status: 302,
      headers: { location: "https://ecommerce.ismworld.org/SSO/Login.aspx?DPLF=Y" },
    })) as typeof fetch;
  clearIsmOfficialHtmlCache();
  try {
    await assert.rejects(fetchIsmOfficialHtml("https://www.ismworld.org/report"), (err) => {
      assert.match(String(err), /HTTP 302.*SSO\/reCAPTCHA/);
      assert.doesNotMatch(String(err), /DPLF/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    clearIsmOfficialHtmlCache();
  }
});

test("preserves the low-level Node fetch cause in ISM diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  const cause = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
  const failure = new TypeError("fetch failed");
  (failure as Error & { cause?: unknown }).cause = cause;
  globalThis.fetch = (async () => {
    throw failure;
  }) as typeof fetch;
  clearIsmOfficialHtmlCache();
  try {
    await assert.rejects(
      fetchIsmOfficialHtml("https://www.ismworld.org/report"),
      /fetch failed.*ETIMEDOUT connect ETIMEDOUT/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    clearIsmOfficialHtmlCache();
  }
});

test("converts TE points into the official-series shape for fallback", () => {
  const obsDate = new Date("2026-07-01T00:00:00.000Z");
  const parsed = convertTePageToIsmReport("manufacturing", {
    headline: {
      label: "ISM Manufacturing PMI",
      value: 55.6,
      previous: 53.3,
      referenceText: "Jul 2026",
      obsDate,
      releaseDate: null,
    },
    components: [
      {
        label: "ISM Manufacturing New Orders",
        value: 56.7,
        previous: 56,
        referenceText: "Jul 2026",
        obsDate,
        releaseDate: null,
      },
    ],
    latestCalendarRelease: null,
    fetchedAt: new Date().toISOString(),
  });
  assert.equal(parsed.pointsByCode.get("ism_us_ism_headline")?.value, 55.6);
  assert.equal(parsed.pointsByCode.get("ism_us_ism_new_orders")?.value, 56.7);
  assert.equal(parsed.pointsByCode.has("ism_us_ism_customers_inventories"), false);
});

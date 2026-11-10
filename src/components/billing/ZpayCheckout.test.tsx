import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import test from "node:test";
import { NextIntlClientProvider } from "next-intl";
import { mergeMessages, type AppLocale, type Messages } from "@/i18n/locales";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";
import { ZpayCheckout, type OnlineCheckout } from "./ZpayCheckout";

// tsx uses classic JSX for this repository's preserve setting; Next uses its own JSX transform.
(globalThis as unknown as { React: typeof React }).React = React;
const base: OnlineCheckout = {
  order: { id: "fixture", orderNo: "1793500000123456789012345678901", amountCny: 421, status: "pending", expiresAt: "2099-01-01T00:00:00Z", fulfilledAt: "" },
  checkout: { action: "https://zpayz.cn/submit.php", fields: { money: "421.00", sign: "signed-value" } },
};
const MESSAGES: Record<AppLocale, Messages> = { zh, en: mergeMessages(zh, en) };
const render = (initial: OnlineCheckout, locale: AppLocale = "zh") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Shanghai">
      <ZpayCheckout initial={initial} onPaid={() => {}} />
    </NextIntlClientProvider>,
  );
test("checkout only offers payment for an unexpired pending order at the expected gateway", () => {
  const html = render(base);
  assert.match(html, /method="post"/); assert.match(html, /name="money" value="421.00"/);
  assert.match(html, /前往 ZPAY 付款/); assert.match(html, /1793500000123456789012345678901/);
  assert.doesNotMatch(render({ ...base, checkout: { ...base.checkout!, action: "https://evil.example" } }), /<form/);
  for (const status of ["paid", "review", "expired", "cancelled"]) assert.doesNotMatch(render({ ...base, order: { ...base.order, status } }), /<form/);
  assert.doesNotMatch(render({ ...base, order: { ...base.order, expiresAt: "2000-01-01T00:00:00Z" } }), /<form/);
});
test("payment success requires recorded entitlement; anomalous payments show reconciliation", () => {
  assert.doesNotMatch(render({ ...base, order: { ...base.order, status: "paid" } }), /付款成功，权益已开通/);
  const paid = render({ ...base, order: { ...base.order, status: "paid", fulfilledAt: "2026-11-01T00:00:00Z" } });
  assert.match(paid, /付款成功，权益已开通/); assert.doesNotMatch(paid, /我已付款，核验开通/);
  const review = render({ ...base, order: { ...base.order, status: "review" } });
  assert.match(review, /付款需人工核对/); assert.match(review, /我已付款，核验开通/);
  assert.doesNotMatch(render({ ...base, order: { ...base.order, orderNo: '<img src=x onerror="alert(1)">' } }), /<img/);
});
test("English checkout shows English labels and CNY amounts", () => {
  const html = render(base, "en");
  assert.match(html, /Pay with ZPAY/); assert.match(html, /CN¥421\.00/); assert.match(html, /Awaiting payment/);
});

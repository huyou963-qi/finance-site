import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { requirePaymentOrigin, paymentErrorResponse } from "./http";
test("payment error handling remains stable across distinct module constructors", () => {
  class AnotherModulePaymentError extends Error { name = "PaymentError"; code = "CHANNEL_UNAVAILABLE"; status = 503; }
  assert.equal(paymentErrorResponse(new AnotherModulePaymentError()).status, 503);
  assert.equal(paymentErrorResponse(new Error("ordinary error")).status, 500);
  assert.equal(paymentErrorResponse({ name: "PaymentError", code: "CHANNEL_UNAVAILABLE", status: 503 }).status, 500);
});
test("payment CSRF accepts only explicit origins including configured production aliases", () => {
  const base = process.env.APP_BASE_URL, aliases = process.env.BILLING_ALLOWED_ORIGINS;
  try {
    process.env.APP_BASE_URL = "https://www.gekkotech.cn";
    process.env.BILLING_ALLOWED_ORIGINS = "https://gekkotech.cn";
    for (const origin of ["https://www.gekkotech.cn", "https://gekkotech.cn"]) requirePaymentOrigin(new NextRequest("https://www.gekkotech.cn/api/billing/zpay/checkout", { headers: { origin } }));
    for (const origin of ["https://gekkotech.cn.evil.example", "http://gekkotech.cn", "null", ""]) assert.throws(() => requirePaymentOrigin(new NextRequest("https://www.gekkotech.cn/api/billing/zpay/checkout", { headers: { origin } })), /INVALID_ORIGIN/);
    for (const invalid of ["*", "http://gekkotech.cn", "https://gekkotech.cn/path", "https://user@gekkotech.cn"]) {
      process.env.BILLING_ALLOWED_ORIGINS = invalid;
      assert.throws(() => requirePaymentOrigin(new NextRequest("https://www.gekkotech.cn/api/billing/zpay/checkout", { headers: { origin: "https://www.gekkotech.cn" } })), /NOT_CONFIGURED/);
    }
  } finally {
    if (base === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = base;
    if (aliases === undefined) delete process.env.BILLING_ALLOWED_ORIGINS; else process.env.BILLING_ALLOWED_ORIGINS = aliases;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { moneyInCents, parseGatewayJson, parseNotification, queryZpay, signZpay, signedCheckout, validateGatewayOrder, verifyZpay, type GatewayOrder } from "./zpay";

const key = "integration-only-not-a-real-secret";
const config = { pid: "123456", key, baseUrl: "https://example.com", methods: ["alipay" as const] };
const order = { orderNo: "12345678901234567890", merchantId: "123456", paymentMethod: "alipay", amountCny: 39 };
const paid: GatewayOrder = { out_trade_no: order.orderNo, pid: "123456", type: "alipay", money: "39.00", status: 1, trade_no: "provider123" };

test("numeric provider identifiers retain precision without altering quoted strings", () => {
  const value = parseGatewayJson('{"pid":201901151314084206659771,"status":1,"name":"12345678901234567890","money":"39.00","note":"a\\\"b1234567890123456789"}');
  assert.equal(value.pid, "201901151314084206659771"); assert.equal(value.status, 1); assert.equal(value.note, 'a"b1234567890123456789');
});

test("money verification rejects rounding, exponent, negative and coerced values", () => {
  for (const invalid of [39, null, "39.001", "3.9e1", "-39", " 39", "39.", "Infinity", "39,00"]) assert.throws(() => moneyInCents(invalid));
  assert.equal(moneyInCents("39"), 3900); assert.equal(moneyInCents("0.01"), 1); assert.equal(moneyInCents("421.00"), 42100);
});
test("signed checkout binds amount, merchant, order and callbacks; no secret is returned", () => {
  const checkout = signedCheckout({ ...order, productType: "pro_month" }, config);
  assert.equal(checkout.action, "https://zpayz.cn/submit.php");
  assert.equal(checkout.fields.notify_url, "https://example.com/api/billing/zpay/notify");
  const alias = signedCheckout({ ...order, productType: "pro_month" }, config, "https://www.example.com");
  assert.equal(alias.fields.return_url, "https://www.example.com/pricing");
  assert.equal(alias.fields.notify_url, "https://example.com/api/billing/zpay/notify");
  assert.equal(verifyZpay(alias.fields, key), true);
  assert.equal(verifyZpay(checkout.fields, key), true);
  for (const field of ["money", "pid", "out_trade_no", "type", "notify_url"]) assert.equal(verifyZpay({ ...checkout.fields, [field]: "tampered" }, key), false);
  assert.equal(JSON.stringify(checkout).includes(key), false);
  assert.equal(verifyZpay({ ...checkout.fields, sign_type: "RSA" }, key), false);
  assert.equal(verifyZpay({ ...checkout.fields, sign: "short" }, key), false);
});
test("signature excludes empty fields and is independent of insertion order", () => {
  assert.equal(signZpay({ b: "中文 + &", a: "1", empty: "", sign_type: "MD5" }, key), signZpay({ a: "1", b: "中文 + &" }, key));
});
test("notification parser rejects duplicate keys, oversized payloads and malformed order numbers", () => {
  const base = `out_trade_no=${order.orderNo}&trade_no=provider123`;
  assert.equal(parseNotification(new URLSearchParams(base)).trade_no, "provider123");
  for (const suffix of ["&trade_no=other", "&money=1&money=39", `&name=${"a".repeat(513)}`]) assert.throws(() => parseNotification(new URLSearchParams(base + suffix)));
  assert.throws(() => parseNotification(new URLSearchParams("out_trade_no=bad&trade_no=abc")));
});
test("gateway evidence must match every identity, amount and success status", () => {
  validateGatewayOrder(paid, order, "provider123");
  for (const delta of [{ pid: "other" }, { out_trade_no: "other" }, { money: "0.01" }, { type: "wxpay" }, { status: 0 }, { status: 2 }, { trade_no: "" }]) assert.throws(() => validateGatewayOrder({ ...paid, ...delta }, order));
  assert.throws(() => validateGatewayOrder(paid, order, "different"));
  assert.throws(() => validateGatewayOrder(paid, { ...order, providerTradeNo: "different" }));
});
test("gateway queries use only fixed origin and redact transport errors", async () => {
  const original = global.fetch;
  try {
    global.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, "https://zpayz.cn"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      return Response.json({ code: 1, ...paid });
    };
    assert.equal((await queryZpay(order.orderNo, config)).trade_no, "provider123");
    global.fetch = async () => { throw new Error(`transport leaked ${key}`); };
    await assert.rejects(queryZpay(order.orderNo, config), e => e instanceof Error && !e.message.includes(key));
    global.fetch = async () => Response.json({ code: -1, msg: key });
    await assert.rejects(queryZpay(order.orderNo, config), /GATEWAY_NOT_FOUND/);
    global.fetch = async () => new Response("x".repeat(17000));
    await assert.rejects(queryZpay(order.orderNo, config), /GATEWAY_INVALID/);
  } finally { global.fetch = original; }
});

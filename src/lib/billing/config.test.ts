import assert from "node:assert/strict";
import test from "node:test";
import { billingConfigSchema, defaultBillingConfig, quotePrice } from "./config";
import { signedCheckout, validateGatewayOrder } from "./zpay";
import { addBillingPeriod } from "./pricing";
const config = () => { const c = structuredClone(defaultBillingConfig); c.campaign = { ...c.campaign, enabled: true, start: "2026-11-01", end: "2026-11-03" }; return c; };
const now = new Date("2026-11-03T15:59:59Z");
test("campaign uses inclusive Shanghai dates and expires without a scheduled task", () => {
  const c = config();
  assert.equal(quotePrice(c, 1, "pro_month", "new", true, now).amountCents, 3120);
  assert.equal(quotePrice(c, 1, "pro_month", "new", true, new Date("2026-11-03T16:00:00Z")).amountCents, 3900);
  assert.equal(quotePrice(c, 1, "pro_month", "new", true, new Date("2026-10-31T15:59:59Z")).amountCents, 3900);
});
test("audience, reservation, product scope and disabled campaigns govern eligibility", () => {
  const c = config();
  for (const audience of ["renew", "guest"] as const) assert.equal(quotePrice(c, 1, "pro_month", audience, true, now).discountCents, 0);
  assert.equal(quotePrice(c, 1, "pro_month", "new", false, now).discountCents, 0);
  c.campaign.plan = "2";
  assert.equal(quotePrice(c, 1, "pro_month", "new", true, now).discountCents, 0);
  assert.equal(quotePrice(c, 1, "pro_year", "new", true, now).amountCents, 33680);
  c.campaign.target = "renew";
  assert.equal(quotePrice(c, 1, "pro_year", "renew", true, now).discountCents, 8420);
  assert.equal(quotePrice(c, 1, "credits", "new", true, now).amountCents, 1900);
  c.campaign.enabled = false;
  assert.equal(quotePrice(c, 1, "pro_year", "renew", true, now).amountCents, 42100);
});
test("fractional money rounds in cents, fixed discount never creates free orders", () => {
  const c = config(); c.plans[0].price = 39.99; c.campaign.value = 12.5;
  assert.equal(quotePrice(c, 2, "pro_month", "new", true, now).amountCents, 3499);
  c.campaign.type = "fixed"; c.campaign.value = 100;
  assert.equal(quotePrice(c, 2, "pro_month", "new", true, now).amountCents, 1);
  c.campaign.value = 20.01;
  assert.equal(quotePrice(c, 2, "pro_month", "new", true, now).amountCents, 1998);
});
test("strict validation rejects malformed dates, periods, types and money precision", () => {
  for (const date of ["2026-99-99", "2026-02-30", "2026-1-01"]) { const c = config(); c.campaign.start = date; assert.equal(billingConfigSchema.safeParse(c).success, false); }
  const c = config(); c.plans[0].price = 0; assert.equal(billingConfigSchema.safeParse(c).success, false);
  c.plans[0].price = 3.999; assert.equal(billingConfigSchema.safeParse(c).success, false);
  c.plans[0].price = 39.99; c.campaign.value = 100; assert.equal(billingConfigSchema.safeParse(c).success, false);
  c.campaign.value = 20; assert.equal(billingConfigSchema.safeParse(c).success, true);
});
test("gateway signatures and verification preserve fractional order snapshot amounts", () => {
  const order = { orderNo: "snapshot123", productType: "pro_quarter", amountCny: 19.98, paymentMethod: "alipay", merchantId: "123" };
  const checkout = signedCheckout(order, { pid: "123", key: "test-key", baseUrl: "https://example.com", methods: ["alipay"] });
  assert.equal(checkout.fields.money, "19.98"); assert.match(checkout.fields.name, /90天/);
  const proof = { out_trade_no: order.orderNo, type: "alipay", pid: "123", status: 1, trade_no: "proof", money: "19.98" };
  assert.doesNotThrow(() => validateGatewayOrder(proof, order));
  assert.throws(() => validateGatewayOrder({ ...proof, money: "39.99" }, order));
  assert.equal(addBillingPeriod(new Date("2026-11-03Z"), "quarter").getTime() - new Date("2026-11-03Z").getTime(), 90 * 86400000);
});

/** Creates one auditable, UNPAID gateway probe. Never pays, refunds or grants membership. */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { checkoutForUser } from "../src/lib/billing/zpayService";
import { moneyInCents, parseGatewayJson, queryZpay, signZpay, zpayConfig } from "../src/lib/billing/zpay";

async function main() {
  if (!process.argv.includes("--create-unpaid-probe")) throw new Error("Explicit --create-unpaid-probe required");
  const config = zpayConfig();
  if (!config.methods.includes("alipay")) throw new Error("Alipay must be the approved configured method");
  const serverIp = process.env.SSH_CONNECTION?.trim().split(/\s+/)[2];
  if (!serverIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(serverIp)) throw new Error("Run from the production SSH session");
  const userId = randomUUID();
  const oldEnabled = process.env.ZPAY_ENABLED;
  let orderId: string | undefined;
  try {
    await prisma.user.create({ data: { id: userId, username: `zpay-probe-${randomUUID().slice(0, 8)}`, role: "user", passHash: "disabled-deployment-fixture", passSalt: "disabled", createdAt: new Date() } });
    // This process only; the website remains disabled during the probe.
    process.env.ZPAY_ENABLED = "true";
    const result = await checkoutForUser(userId, { productType: "pro_month", method: "alipay", idempotencyKey: randomUUID() });
    const order = result.order; orderId = order.id;
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { manualNote: "部署验收：不付款的通道探测，测试账号随后关闭，不作为会员销售" } });
    const fields: Record<string, string> = { ...result.checkout.fields, clientip: serverIp, device: "pc" };
    fields.sign = signZpay(fields, config.key);
    const form = new FormData(); for (const [key, value] of Object.entries(fields)) form.set(key, value);
    const response = await fetch("https://zpayz.cn/mapi.php", { method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(8000) });
    const raw = await response.text();
    if (raw.length > 16384) throw new Error("Oversized gateway response");
    const data = parseGatewayJson(raw);
    const created = response.ok && data.code === 1;
    const message = typeof data.msg === "string" ? data.msg : "";
    const code = created ? "OK" : /余额|充值/.test(message) ? "INSUFFICIENT_PLATFORM_BALANCE" : /审核|签约|未开通|维护/.test(message) ? "CHANNEL_UNAVAILABLE" : "GATEWAY_REJECTED";
    let pendingEvidenceVerified = false;
    if (created) {
      const proof = await queryZpay(order.orderNo, config);
      pendingEvidenceVerified = String(proof.pid) === config.pid && proof.out_trade_no === order.orderNo && proof.type === "alipay" && moneyInCents(proof.money) === 3900 && (proof.status === 0 || proof.status === "0");
    }
    await prisma.paymentEvent.create({ data: { orderId, kind: "deployment_probe", source: "ops", code, details: { amountCny: 39, gatewayOrderCreated: created, pendingEvidenceVerified, realPaymentAttempted: false } } });
    console.log(JSON.stringify({ orderNo: order.orderNo, amountCny: 39, gatewayOrderCreated: created, pendingEvidenceVerified, code, realPaymentAttempted: false }));
    if (!created || !pendingEvidenceVerified) process.exitCode = 1;
  } finally {
    if (oldEnabled === undefined) delete process.env.ZPAY_ENABLED; else process.env.ZPAY_ENABLED = oldEnabled;
    // Preserve evidence without contaminating active-member counts or granting test privileges.
    await prisma.user.updateMany({ where: { id: userId }, data: { status: "closed" } });
    if (orderId) await prisma.paymentOrder.updateMany({ where: { id: orderId, status: "pending", fulfilledAt: null }, data: { status: "expired", expiresAt: new Date(), nextCheckAt: null } });
  }
}
void main().catch(() => { console.error("Unpaid billing probe failed; inspect the ops payment event. No payment was submitted."); process.exitCode = 1; }).finally(() => prisma.$disconnect());

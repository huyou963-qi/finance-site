import { createHash, timingSafeEqual } from "node:crypto";

export class PaymentError extends Error {
  constructor(public code: string, public status = 400) { super(code); this.name = "PaymentError"; }
}
/** Next/tsx may load a server library through distinct CJS/ESM module instances. */
export function isPaymentError(error: unknown): error is PaymentError {
  if (!(error instanceof Error) || error.name !== "PaymentError") return false;
  const candidate = error as PaymentError;
  return typeof candidate.code === "string" && /^[A-Z_]{1,64}$/.test(candidate.code) && Number.isInteger(candidate.status) && candidate.status >= 400 && candidate.status <= 599;
}
export type PaymentMethod = "alipay" | "wxpay";
export type ZpayConfig = { pid: string; key: string; baseUrl: string; methods: PaymentMethod[] };

/** Explicit opt-in only; callbacks/queries remain operational when new checkout is disabled. */
export function zpayConfig(): ZpayConfig {
  const pid = process.env.ZPAY_PID?.trim() ?? "";
  const key = process.env.ZPAY_KEY?.trim() ?? "";
  if (!/^[a-zA-Z0-9]{1,64}$/.test(pid) || key.length < 16) throw new PaymentError("NOT_CONFIGURED", 503);
  let url: URL;
  try { url = new URL(process.env.APP_BASE_URL ?? ""); } catch { throw new PaymentError("NOT_CONFIGURED", 503); }
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new PaymentError("NOT_CONFIGURED", 503);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new PaymentError("NOT_CONFIGURED", 503);
  const methods = (process.env.ZPAY_METHODS ?? "").split(",").map(v => v.trim()).filter((v): v is PaymentMethod => v === "alipay" || v === "wxpay");
  return { pid, key, baseUrl: url.origin, methods: [...new Set(methods)] };
}
export function checkoutMethods(): PaymentMethod[] {
  if (process.env.ZPAY_ENABLED !== "true") return [];
  try { return zpayConfig().methods; } catch { return []; }
}

export function signZpay(fields: Record<string, string>, key: string): string {
  const canonical = Object.keys(fields).filter(k => k !== "sign" && k !== "sign_type" && fields[k] !== "").sort().map(k => `${k}=${fields[k]}`).join("&");
  return createHash("md5").update(canonical + key, "utf8").digest("hex");
}
export function verifyZpay(fields: Record<string, string>, key: string): boolean {
  if (fields.sign_type !== "MD5" || !/^[a-f0-9]{32}$/.test(fields.sign ?? "")) return false;
  return timingSafeEqual(Buffer.from(signZpay(fields, key)), Buffer.from(fields.sign));
}
/** No float coercion, exponents, negative values or silent rounding in payment verification. */
export function moneyInCents(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value)) throw new PaymentError("INVALID_AMOUNT");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function parseNotification(params: URLSearchParams): Record<string, string> {
  const data: Record<string, string> = Object.create(null);
  if (params.toString().length > 8192) throw new PaymentError("INVALID_NOTIFICATION");
  for (const [key, value] of params) {
    if (Object.hasOwn(data, key) || key.length > 64 || value.length > 512) throw new PaymentError("INVALID_NOTIFICATION");
    data[key] = value;
  }
  if (!/^\d{1,32}$/.test(data.out_trade_no ?? "") || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.trade_no ?? "")) throw new PaymentError("INVALID_NOTIFICATION");
  return data;
}
export type GatewayOrder = { trade_no: string; out_trade_no: string; pid: string | number; money: string; type: string; status: number | string };

/** Some gateways emit a numeric merchant ID beyond JS safe integer precision. */
export function parseGatewayJson(raw: string) {
  return JSON.parse(raw.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token => /^\d{16,}$/.test(token) ? `"${token}"` : token));
}

export function validateGatewayOrder(data: GatewayOrder, order: { orderNo: string; merchantId: string | null; amountCny: number; paymentMethod: string | null; providerTradeNo?: string | null }, expectedTradeNo?: string) {
  if (String(data.pid) !== order.merchantId || data.out_trade_no !== order.orderNo || data.type !== order.paymentMethod || moneyInCents(data.money) !== moneyInCents(order.amountCny.toFixed(2))) throw new PaymentError("ORDER_MISMATCH", 409);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(data.trade_no ?? "")) throw new PaymentError("INVALID_TRADE", 502);
  if ((expectedTradeNo && data.trade_no !== expectedTradeNo) || (order.providerTradeNo && order.providerTradeNo !== data.trade_no)) throw new PaymentError("TRADE_MISMATCH", 409);
  if (data.status !== 1 && data.status !== "1") throw new PaymentError("NOT_PAID", 409);
}

/** Fixed HTTPS origin; never log this URL because the protocol puts the key in its query. */
export async function queryZpay(orderNo: string, config = zpayConfig()): Promise<GatewayOrder> {
  const url = new URL("https://zpayz.cn/api.php");
  url.search = new URLSearchParams({ act: "order", pid: config.pid, key: config.key, out_trade_no: orderNo }).toString();
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new PaymentError("GATEWAY_UNAVAILABLE", 502);
    const reader = res.body?.getReader();
    if (!reader) throw new PaymentError("GATEWAY_INVALID", 502);
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16384) { await reader.cancel(); throw new PaymentError("GATEWAY_INVALID", 502); }
      chunks.push(part.value);
    }
    const data = parseGatewayJson(Buffer.concat(chunks).toString("utf8"));
    if (data?.code !== 1) throw new PaymentError("GATEWAY_NOT_FOUND", 502);
    return data as GatewayOrder;
  } catch (e) {
    if (isPaymentError(e)) throw e;
    throw new PaymentError("GATEWAY_UNAVAILABLE", 502);
  }
}

export function signedCheckout(order: { orderNo: string; amountCny: number; paymentMethod: string | null; productType: string }, config = zpayConfig(), returnOrigin = config.baseUrl) {
  const fields: Record<string, string> = { pid: config.pid, type: order.paymentMethod!, out_trade_no: order.orderNo,
    name: order.productType === "pro_quarter" ? "GekkoTech Pro 季费会员（90天）" : order.productType === "pro_year" ? "GekkoTech Pro 年费会员（365天）" : order.productType === "pro_month" ? "GekkoTech Pro 月费会员（30天）" : "GekkoTech 回测积分包（10次）",
    money: order.amountCny.toFixed(2), notify_url: `${config.baseUrl}/api/billing/zpay/notify`, return_url: `${returnOrigin}/pricing`, sign_type: "MD5" };
  fields.sign = signZpay(fields, config.key);
  return { action: "https://zpayz.cn/submit.php", fields };
}

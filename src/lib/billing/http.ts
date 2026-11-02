import { NextRequest, NextResponse } from "next/server";
import { PaymentError, isPaymentError } from "./zpay";

export function requirePaymentOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || req.url).origin;
  const aliases = (process.env.BILLING_ALLOWED_ORIGINS ?? "").split(",").map(v => v.trim()).filter(Boolean);
  for (const alias of aliases) {
    let url: URL;
    try { url = new URL(alias); } catch { throw new PaymentError("NOT_CONFIGURED", 503); }
    if (url.protocol !== "https:" || url.origin !== alias || url.username || url.password) throw new PaymentError("NOT_CONFIGURED", 503);
  }
  if (!origin || ![expected, ...aliases].includes(origin)) throw new PaymentError("INVALID_ORIGIN", 403);
}
export async function paymentJson(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/json") || Number(req.headers.get("content-length") || 0) > 2048) throw new PaymentError("INVALID_REQUEST");
  const text = await req.text();
  if (text.length > 2048) throw new PaymentError("INVALID_REQUEST");
  try { const body = JSON.parse(text); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body; }
  catch { throw new PaymentError("INVALID_REQUEST"); }
}
export function paymentErrorResponse(e: unknown) {
  const code = isPaymentError(e) ? e.code : "INTERNAL_ERROR";
  const messages: Record<string, string> = {
    UNAUTHORIZED: "请先登录", FORBIDDEN: "无订单管理权限", INVALID_REQUEST: "支付请求格式无效", INVALID_ORIGIN: "请从本站页面操作",
    NOT_CONFIGURED: "在线支付尚未配置，请稍后再试", CHANNEL_UNAVAILABLE: "支付通道审核或维护中，暂不能付款",
    ORDER_NOT_FOUND: "订单不存在", ORDER_NOT_PAYABLE: "订单已支付或已过期，请查看订单状态",
    TOO_MANY_ORDERS: "下单过于频繁，请稍后再试", PERMANENT_PRO: "你已拥有永久 Pro，无需重复购买",
    ACCOUNT_REVIEW: "账号需人工处理，请联系站点客服", IDEMPOTENCY_CONFLICT: "请求已用于其他商品，请重新选择",
    UNPAID_ORDER_EXISTS: "已有该商品的待付款订单，请在我的订单中继续付款或核验状态",
  };
  return NextResponse.json({ error: messages[code] ?? "支付请求未完成，请刷新订单状态后重试", code }, { status: isPaymentError(e) ? e.status : 500, headers: { "Cache-Control": "no-store" } });
}

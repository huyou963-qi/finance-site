import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { checkoutMethods } from "@/lib/billing/zpay";
import { paymentJson, requirePaymentOrigin, paymentErrorResponse } from "@/lib/billing/http";
import {
  createPaymentOrder,
  listOrdersForUser,
  paymentInstructions,
  serializeOrder,
} from "@/lib/billing/orders";
import {
  CREDIT_PACK_CNY,
  CREDIT_PACK_CREDITS,
  PLAN_FEATURES,
  PRICE_MONTHLY_CNY,
  PRICE_YEARLY_CNY,
  PRICE_YEARLY_LIST_CNY,
  TRIAL_DAYS,
  YEARLY_DISCOUNT,
  type ProductType,
} from "@/lib/billing/pricing";

const PRODUCTS = new Set<ProductType>(["pro_month", "pro_year", "credits"]);

export async function GET(req: NextRequest) {
  const user = await getUserByRequest(req);
  const catalog = {
    trialDays: TRIAL_DAYS,
    monthlyCny: PRICE_MONTHLY_CNY,
    yearlyCny: PRICE_YEARLY_CNY,
    yearlyListCny: PRICE_YEARLY_LIST_CNY,
    yearlyDiscount: YEARLY_DISCOUNT,
    creditPack: { credits: CREDIT_PACK_CREDITS, cny: CREDIT_PACK_CNY },
    features: PLAN_FEATURES,
    payment: paymentInstructions(),
    onlineMethods: checkoutMethods(),
  };
  if (!user) {
    return NextResponse.json({ ...catalog, orders: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  const orders = await listOrdersForUser(user.id);
  return NextResponse.json({ ...catalog, orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  try {
    requirePaymentOrigin(req);
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await paymentJson(req)) as { productType?: string; manualNote?: string };
    if (body.manualNote !== undefined && (typeof body.manualNote !== "string" || body.manualNote.length > 512)) return NextResponse.json({ error: "备注无效" }, { status: 400 });
    const productType = body.productType as ProductType;
    if (!PRODUCTS.has(productType)) {
      return NextResponse.json({ error: "无效的商品类型" }, { status: 400 });
    }
    const order = await createPaymentOrder({
      userId: user.id,
      productType,
      manualNote: body.manualNote,
    });
    return NextResponse.json(
      { order: serializeOrder(order), payment: paymentInstructions() },
      { status: 201 },
    );
  } catch (e) {
    return paymentErrorResponse(e);
  }
}

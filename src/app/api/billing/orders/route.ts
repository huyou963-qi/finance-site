import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
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
  };
  if (!user) {
    return NextResponse.json({ ...catalog, orders: [] });
  }
  const orders = await listOrdersForUser(user.id);
  return NextResponse.json({ ...catalog, orders });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as { productType?: string; manualNote?: string };
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
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

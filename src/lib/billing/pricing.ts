/** Finova B2C 定价与权益（与变现计划锁定一致） */

export const TRIAL_DAYS = 7;
export const YEARLY_DISCOUNT = 0.1;
export const PRICE_MONTHLY_CNY = 39;
/** 39 × 12 × 0.9 ≈ 421.2 */
export const PRICE_YEARLY_CNY = 421;
export const PRICE_YEARLY_LIST_CNY = PRICE_MONTHLY_CNY * 12;

export const CREDIT_PACK_CREDITS = 10;
export const CREDIT_PACK_CNY = 19;

export type BillingPeriod = "month" | "year";
export type ProductType = "pro_month" | "pro_year" | "credits";

export const PLAN_FEATURES = {
  visitor: [
    "首页与品牌介绍",
    "宏观部分模板只读",
    "美股基础 K 线",
    "行业概览",
  ],
  standard: [
    "登录后保存书签与宏观图表偏好",
    "有限使用选股器（不可保存策略）",
    "AI 周报标题与摘要",
  ],
  pro: [
    "AI 周报全文",
    "市场事件时间线深度浏览",
    "选股策略保存",
    "策略回测（不消耗积分）",
    "因子研究",
    "数据导出能力（随功能开放）",
  ],
} as const;

export function amountForProduct(productType: ProductType): number {
  switch (productType) {
    case "pro_month":
      return PRICE_MONTHLY_CNY;
    case "pro_year":
      return PRICE_YEARLY_CNY;
    case "credits":
      return CREDIT_PACK_CNY;
  }
}

export function periodForProduct(productType: ProductType): BillingPeriod | null {
  if (productType === "pro_month") return "month";
  if (productType === "pro_year") return "year";
  return null;
}

export function productLabel(productType: ProductType): string {
  switch (productType) {
    case "pro_month":
      return "Pro 月付";
    case "pro_year":
      return "Pro 年付";
    case "credits":
      return `回测积分包（${CREDIT_PACK_CREDITS} 次）`;
  }
}

export function addBillingPeriod(from: Date, period: BillingPeriod): Date {
  const d = new Date(from.getTime());
  if (period === "month") {
    d.setUTCDate(d.getUTCDate() + 30);
  } else {
    d.setUTCDate(d.getUTCDate() + 365);
  }
  return d;
}

/** Shared, deterministic pricing rules. All money calculations use integer cents. */
import { z } from "zod";
import { amountForProduct, periodForProduct, type ProductType } from "./pricing";

const money = z.number().finite().positive().max(100000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-7, "金额最多两位小数");
const date = z.string().refine(v => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v), "日期无效");
const plan = z.object({ name: z.string().trim().min(1).max(30), months: z.number(), price: money, enabled: z.boolean(), tagline: z.string().max(60) }).strict();
export const billingConfigSchema = z.object({
  plans: z.tuple([plan.extend({ months: z.literal(1) }), plan.extend({ months: z.literal(3) }), plan.extend({ months: z.literal(12) })]),
  campaign: z.object({ name: z.string().trim().max(60), type: z.enum(["percent", "fixed"]), value: money, target: z.enum(["new", "renew", "all"]), plan: z.enum(["all", "0", "1", "2"]), start: date, end: date, enabled: z.boolean() }).strict(),
}).strict().superRefine((c, ctx) => {
  if (c.campaign.type === "percent" && c.campaign.value >= 100) ctx.addIssue({ code: "custom", message: "减免比例须小于100%", path: ["campaign", "value"] });
  if (c.campaign.enabled && (!c.campaign.name || !c.campaign.start || !c.campaign.end || c.campaign.end < c.campaign.start)) ctx.addIssue({ code: "custom", message: "启用活动须填写名称及有效起止日期", path: ["campaign"] });
});
export type BillingConfig = z.infer<typeof billingConfigSchema>;
export const defaultBillingConfig: BillingConfig = {
  plans: [
    { name: "月付会员", months: 1, price: amountForProduct("pro_month"), enabled: true, tagline: "低门槛体验，随时开始" },
    { name: "季付会员", months: 3, price: amountForProduct("pro_quarter"), enabled: false, tagline: "持续研究，更从容的选择" },
    { name: "年付会员", months: 12, price: amountForProduct("pro_year"), enabled: true, tagline: "长期陪伴，让研究积累价值" },
  ],
  campaign: { name: "新会员专享", type: "percent", value: 20, target: "new", plan: "all", start: "", end: "", enabled: false },
};
export const membershipProducts = ["pro_month", "pro_quarter", "pro_year"] as const;
export function quotePrice(config: BillingConfig, revision: number, product: ProductType, audience: "new" | "renew" | "guest", firstAvailable = true, now = new Date()) {
  const index = membershipProducts.indexOf(product as typeof membershipProducts[number]);
  const p = config.plans[index];
  const baseCents = Math.round((p?.price ?? amountForProduct(product)) * 100);
  const c = config.campaign;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
  const applies = index >= 0 && audience !== "guest" && c.enabled && today >= c.start && today <= c.end && (c.plan === "all" || Number(c.plan) === index) && (c.target === "all" || c.target === audience) && (c.target !== "new" || firstAvailable);
  const discountCents = applies ? Math.min(baseCents - 1, c.type === "percent" ? Math.round(baseCents * Math.round(c.value * 100) / 10000) : Math.round(c.value * 100)) : 0;
  return { version: 1, revision, productType: product, period: periodForProduct(product), enabled: p?.enabled ?? true, name: p?.name ?? "积分包", tagline: p?.tagline ?? "", baseCents, discountCents, amountCents: baseCents - discountCents, campaign: applies ? { ...c } : null, firstPurchaseDiscount: applies && c.target === "new", quotedAt: now.toISOString() };
}

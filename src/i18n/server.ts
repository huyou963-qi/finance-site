import { headers } from "next/headers";
import { cache } from "react";
import { checkFeatureAccess, loadFeatureAccessPolicy } from "@/lib/access/featureAccess";
import { featureRuleFor } from "@/lib/access/featureCatalog";
import {
  DEFAULT_LOCALE,
  ENGLISH_FEATURE_ID,
  LOCALE_HEADER,
  PATHNAME_HEADER,
  parseLocale,
  type AppLocale,
} from "@/i18n/locales";

export type RequestLocale = {
  /** 网址要求的语言 */
  requested: AppLocale;
  /** 实际渲染的语言（英文未开放时为中文） */
  locale: AppLocale;
  /** 去掉语言前缀后的页面路径 */
  pathname: string;
};

/**
 * 本次请求的语言（由 middleware 写入请求头）。
 * 只有网址是 /en 时才查功能权限，常见的中文请求不打库。
 */
export const getRequestLocale = cache(async (): Promise<RequestLocale> => {
  const h = await headers();
  const requested = parseLocale(h.get(LOCALE_HEADER));
  const pathname = h.get(PATHNAME_HEADER) || "/";
  if (requested !== "en") return { requested, locale: DEFAULT_LOCALE, pathname };
  const gate = await checkFeatureAccess(ENGLISH_FEATURE_ID);
  return { requested, locale: gate.allowed ? "en" : DEFAULT_LOCALE, pathname };
});

/** 英文是否已对所有人上线（决定是否向搜索引擎声明英文版 hreflang） */
export async function isEnglishPublic(): Promise<boolean> {
  const policy = await loadFeatureAccessPolicy();
  return featureRuleFor(policy, ENGLISH_FEATURE_ID)?.status === "released";
}

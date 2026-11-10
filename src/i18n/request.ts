import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import {
  DEFAULT_LOCALE,
  ENGLISH_FEATURE_ID,
  LOCALE_COOKIE,
  mergeMessages,
  parseLocale,
  type Messages,
} from "@/i18n/locales";
import zh from "@/i18n/messages/zh.json";

/**
 * 每个请求的语言与文案（next-intl 不分路由模式）。
 * - 语言来自 cookie；只有 cookie 为 en 时才查功能权限（常见的中文请求不打库）。
 * - 英文未对当前身份开放时，按中文渲染。
 * - 英文文案与中文深合并，缺的键显示中文。
 */
export default getRequestConfig(async () => {
  let locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (locale === "en") {
    const gate = await checkFeatureAccess(ENGLISH_FEATURE_ID);
    if (!gate.allowed) locale = DEFAULT_LOCALE;
  }

  const base = zh as Messages;
  const messages =
    locale === "en"
      ? mergeMessages(base, (await import("@/i18n/messages/en.json")).default as Messages)
      : base;

  return { locale, messages, timeZone: "Asia/Shanghai" };
});

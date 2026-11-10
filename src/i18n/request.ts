import { getRequestConfig } from "next-intl/server";
import { mergeMessages, type Messages } from "@/i18n/locales";
import { getRequestLocale } from "@/i18n/server";
import zh from "@/i18n/messages/zh.json";

/**
 * 每个请求的语言与文案（next-intl 不分路由模式，语言来自 middleware 写的请求头）。
 * 英文文案与中文深合并，缺的键显示中文。
 */
export default getRequestConfig(async () => {
  const { locale } = await getRequestLocale();
  const base = zh as Messages;
  const messages =
    locale === "en"
      ? mergeMessages(base, (await import("@/i18n/messages/en.json")).default as Messages)
      : base;
  return { locale, messages, timeZone: "Asia/Shanghai" };
});

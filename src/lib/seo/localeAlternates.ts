/**
 * 页面自设 canonical 时，一并带上中英文 hreflang，避免浅层合并覆盖根布局的 languages。
 * 英文未对所有人上线时只返回当前语言的 canonical（与根布局一致）。
 */
import type { Metadata } from "next";
import { localizeHref, type AppLocale } from "@/i18n/locales";
import { getRequestLocale, isEnglishPublic } from "@/i18n/server";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export async function localeAlternates(pathname: string): Promise<NonNullable<Metadata["alternates"]>> {
  const { locale } = await getRequestLocale();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const toAbs = (loc: AppLocale) => absoluteUrl(localizeHref(path, loc));
  if (!(await isEnglishPublic())) {
    return { canonical: toAbs(locale) };
  }
  return {
    canonical: toAbs(locale),
    languages: {
      "zh-CN": toAbs("zh"),
      en: toAbs("en"),
      "x-default": toAbs("zh"),
    },
  };
}

"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { localizeHref, splitLocalePath } from "@/i18n/locales";

/**
 * 当前页面路径（去掉 /en 前缀）。导航高亮、按路径判断功能等逻辑用它，
 * 中英文下得到同一个路径。
 */
export function useLocalePathname(): string {
  return splitLocalePath(usePathname() ?? "/").pathname;
}

/** 站内链接：字符串 href 自动带上当前语言前缀；其余写法与 next/link 相同。 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return <NextLink href={typeof href === "string" ? localizeHref(href, locale) : href} {...props} />;
}

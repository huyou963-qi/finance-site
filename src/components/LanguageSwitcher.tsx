"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LOCALES, localizeHref, parseLocale, type AppLocale } from "@/i18n/locales";

/** 切换后的目标地址：英文直接进 /en 页面（middleware 记住偏好）；中文经 API 清掉偏好 */
function switchTarget(locale: AppLocale): string {
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (locale === "en") return localizeHref(here, "en");
  return `/api/i18n/reset?to=${encodeURIComponent(localizeHref(here, "zh"))}`;
}

/**
 * 中文 / English 分段切换：在 /x 与 /en/x 之间整页跳转
 * （根布局的 html lang 与文案要整页重新渲染，不能用客户端路由）。
 * 是否展示由调用方按 `features.can(ENGLISH_FEATURE_ID)` 决定。
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const current = parseLocale(useLocale());
  const [pending, setPending] = useState(false);

  const choose = (locale: AppLocale) => {
    if (locale === current || pending) return;
    setPending(true);
    window.location.assign(switchTarget(locale));
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("switcher")}
      className={`inline-flex shrink-0 items-center rounded-md border border-fs-border p-0.5 text-xs ${
        pending ? "opacity-60" : ""
      } ${className}`}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            lang={locale === "en" ? "en" : "zh-CN"}
            onClick={() => choose(locale)}
            className={`min-h-8 rounded px-2 font-medium transition ${
              active ? "bg-fs-accent-soft text-fs-accent-text" : "text-fs-muted hover:text-fs-text"
            }`}
          >
            {t(locale)}
          </button>
        );
      })}
    </div>
  );
}

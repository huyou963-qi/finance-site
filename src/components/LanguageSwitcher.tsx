"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALES, LOCALE_COOKIE, parseLocale, type AppLocale } from "@/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/**
 * 中文 / English 分段切换。写 cookie 后刷新服务端组件，URL 不变。
 * 是否展示由调用方按 `features.can(ENGLISH_FEATURE_ID)` 决定。
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("language");
  const current = parseLocale(useLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (locale: AppLocale) => {
    if (locale === current || pending) return;
    writeLocaleCookie(locale);
    startTransition(() => router.refresh());
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

"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ProPaywall({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const t = useTranslations("payment");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-fs-border bg-white px-6 py-10 text-center shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-fs-muted">Pro</p>
      <h2 className="mt-2 text-lg font-semibold text-fs-text">{title ?? t("paywallTitle")}</h2>
      <p className="mt-2 text-sm text-fs-secondary">{description ?? t("paywallBody")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/pricing"
          className="rounded-md bg-fs-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {t("viewPricing")}
        </Link>
        <Link
          href="/auth"
          className="rounded-md border border-fs-border px-4 py-2 text-sm text-fs-text hover:bg-fs-elevated"
        >
          {t("loginRegister")}
        </Link>
      </div>
    </div>
  );
}

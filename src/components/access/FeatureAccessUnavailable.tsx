"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function FeatureAccessUnavailable() {
  const router = useRouter();
  const t = useTranslations("access");
  const tc = useTranslations("common");
  return (
    <div role="alert" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">{t("unavailableTitle")}</h1>
      <p className="text-sm leading-6 text-fs-muted">{t("unavailableBody")}</p>
      <button
        type="button"
        className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-4 py-2 text-sm font-medium text-fs-accent-text"
        onClick={() => router.refresh()}
      >
        {tc("retry")}
      </button>
    </div>
  );
}

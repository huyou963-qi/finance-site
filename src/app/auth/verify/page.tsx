import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { VerifyClient } from "./VerifyClient";

export default function VerifyPage() {
  const t = useTranslations("verify");
  return (
    <div className="mx-auto max-w-xl px-4 lg:px-6">
      <Suspense fallback={<div className="text-sm text-fs-muted">{t("preparing")}</div>}>
        <VerifyClient />
      </Suspense>
    </div>
  );
}

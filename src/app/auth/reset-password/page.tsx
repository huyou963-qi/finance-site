import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { ResetPasswordClient } from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  const tc = useTranslations("common");
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">{tc("loading")}</p>}>
      <ResetPasswordClient />
    </Suspense>
  );
}

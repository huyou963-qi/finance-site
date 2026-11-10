import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { AuthClient } from "./AuthClient";

export default function AuthPage() {
  const tc = useTranslations("common");
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">{tc("loading")}</p>}>
      <AuthClient />
    </Suspense>
  );
}

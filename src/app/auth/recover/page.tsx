import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { RecoverAccountClient } from "./RecoverAccountClient";

export default function RecoverAccountPage() {
  const tc = useTranslations("common");
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">{tc("loading")}</p>}>
      <RecoverAccountClient />
    </Suspense>
  );
}

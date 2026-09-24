import { Suspense } from "react";
import { ResetPasswordClient } from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">加载中…</p>}>
      <ResetPasswordClient />
    </Suspense>
  );
}

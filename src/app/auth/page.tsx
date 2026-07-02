import { Suspense } from "react";
import { AuthClient } from "./AuthClient";

export default function AuthPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">加载中…</p>}>
      <AuthClient />
    </Suspense>
  );
}

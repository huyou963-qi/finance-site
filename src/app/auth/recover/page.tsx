import { Suspense } from "react";
import { RecoverAccountClient } from "./RecoverAccountClient";

export default function RecoverAccountPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">加载中…</p>}>
      <RecoverAccountClient />
    </Suspense>
  );
}

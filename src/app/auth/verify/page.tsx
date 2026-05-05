import { Suspense } from "react";
import { VerifyClient } from "./VerifyClient";

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-xl px-4 lg:px-6">
      <Suspense fallback={<div className="text-sm text-slate-400">正在准备验证页面…</div>}>
        <VerifyClient />
      </Suspense>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function FeatureAccessUnavailable() {
  const router = useRouter();
  return (
    <div role="alert" className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">访问权限校验暂时不可用</h1>
      <p className="text-sm leading-6 text-fs-muted">服务繁忙，请稍后重试。</p>
      <button
        type="button"
        className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-4 py-2 text-sm font-medium text-fs-accent-text"
        onClick={() => router.refresh()}
      >
        重试
      </button>
    </div>
  );
}

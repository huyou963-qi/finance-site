import type { Metadata } from "next";
import { Suspense } from "react";
import { WeeklyClient } from "./WeeklyClient";

export const metadata: Metadata = {
  title: "AI周度观察 — Finance site",
  description: "AI 生成的周度跨资产市场观察报告",
};

export default function WeeklyPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">加载中…</p>}>
        <WeeklyClient />
      </Suspense>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { EventsClient } from "./EventsClient";

export const metadata: Metadata = {
  title: "历史时间线 — Finova",
  description: "美国历史经济时代横轴时间线与事件列表",
};

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">加载中…</p>
      }
    >
      <EventsClient />
    </Suspense>
  );
}

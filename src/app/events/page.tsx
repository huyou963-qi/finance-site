import type { Metadata } from "next";
import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EventsClient } from "./EventsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "历史时间线 — GekkoTech",
  description: "美国历史经济时代横轴时间线与事件列表",
};

export default function EventsPage() {
  return (
    <FeatureGate featureId="events">
      <Suspense
        fallback={
          <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">加载中…</p>
        }
      >
        <EventsClient />
      </Suspense>
    </FeatureGate>
  );
}

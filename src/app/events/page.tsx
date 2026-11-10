import type { Metadata } from "next";
import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EventsClient } from "./EventsClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getServerTr();
  return {
  title: tr("历史时间线 — GekkoTech"),
  description: tr("美国历史经济时代横轴时间线与事件列表"),
};
}

export default async function EventsPage() {
  const tr = await getServerTr();
  return (
    <FeatureGate featureId="events">
      <Suspense
        fallback={
          <p className="flex flex-1 items-center justify-center text-sm text-fs-muted">{tr("加载中…")}</p>
        }
      >
        <EventsClient />
      </Suspense>
    </FeatureGate>
  );
}

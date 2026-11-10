import type { Metadata } from "next";
import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { WeeklyClient } from "./WeeklyClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getServerTr();
  return {
  title: tr("AI周度观察 — Finance site"),
  description: tr("AI 生成的周度跨资产市场观察报告"),
};
}

export default async function WeeklyPage() {
  const tr = await getServerTr();
  return (
    <FeatureGate featureId="weekly">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <Suspense fallback={<p className="px-4 py-12 text-sm text-fs-muted">{tr("加载中…")}</p>}>
          <WeeklyClient />
        </Suspense>
      </div>
    </FeatureGate>
  );
}

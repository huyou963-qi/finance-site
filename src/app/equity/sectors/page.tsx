import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EquitySectorsClient } from "./EquitySectorsClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getServerTr();
  return {
  title: tr("美股历史 — 历史阶段与行业轮动研究 — GekkoTech"),
  description: tr("研究美股历史阶段、宏观传导与行业轮动，结合当前基本面与可审计证据。"),
};
}

export default async function EquitySectorsPage() {
  const tr = await getServerTr();
  return (
    <FeatureGate featureId="equity-sectors">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">{tr("加载中…")}</div>
        }
      >
        <EquitySectorsClient />
      </Suspense>
    </FeatureGate>
  );
}

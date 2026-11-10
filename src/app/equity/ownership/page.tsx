import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { OwnershipClient } from "./OwnershipClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("持股与供给监控 | GekkoTech") };
}
export default async function OwnershipPage() {
  const tr = await getServerTr();
  return (
    <FeatureGate featureId="equity-ownership">
      <Suspense fallback={<p className="p-6">{tr("加载持股监控…")}</p>}>
        <OwnershipClient />
      </Suspense>
    </FeatureGate>
  );
}

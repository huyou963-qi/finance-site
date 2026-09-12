import { Suspense } from "react";
import { FeatureGate } from "@/components/access/FeatureGate";
import { EquitySectorDetailClient } from "./EquitySectorDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sector: string }> };

export default async function EquitySectorDetailPage({ params }: Props) {
  const { sector } = await params;
  return (
    <FeatureGate featureId="equity-sectors">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载中…
          </div>
        }
      >
        <EquitySectorDetailClient sectorSlug={sector} />
      </Suspense>
    </FeatureGate>
  );
}

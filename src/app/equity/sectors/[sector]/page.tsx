import { Suspense } from "react";
import { EquitySectorDetailClient } from "./EquitySectorDetailClient";

type Props = { params: Promise<{ sector: string }> };

export default async function EquitySectorDetailPage({ params }: Props) {
  const { sector } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
          加载中…
        </div>
      }
    >
      <EquitySectorDetailClient sectorSlug={sector} />
    </Suspense>
  );
}

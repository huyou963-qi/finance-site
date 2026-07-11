import { Suspense } from "react";
import { IndustryDetailClient } from "./IndustryDetailClient";

type Props = { params: Promise<{ sector: string; industry: string }> };

export default async function IndustryDetailPage({ params }: Props) {
  const { sector, industry } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
          加载中…
        </div>
      }
    >
      <IndustryDetailClient sectorSlug={sector} industrySlug={industry} />
    </Suspense>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSectorDef, sectorFromSlug } from "@/lib/equity/gicsCatalog";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { EquitySectorDetailClient } from "./EquitySectorDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sector: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sector: slug } = await params;
  const sector = sectorFromSlug(slug);
  if (!sector) return { title: "行业不存在 — GekkoTech" };
  const def = getSectorDef(sector);
  return {
    title: `${def.nameZh}（${def.sector}）行业收益、财报与成分股 — GekkoTech`,
    description: `${def.nameZh}板块（对标 ${def.etf}）的收益表现、财报叙事与成分股一览。`,
    alternates: { canonical: absoluteUrl(`/equity/sectors/${slug}`) },
  };
}

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

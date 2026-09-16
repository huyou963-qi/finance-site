import { Suspense } from "react";
import type { Metadata } from "next";
import { getSectorDef, sectorFromSlug } from "@/lib/equity/gicsCatalog";
import { industryFromSlug } from "@/lib/equity/gicsIndustryCatalog";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { IndustryDetailClient } from "./IndustryDetailClient";

type Props = { params: Promise<{ sector: string; industry: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sector: sectorSlug, industry: industrySlug } = await params;
  const sector = sectorFromSlug(sectorSlug);
  const industry = sector ? industryFromSlug(industrySlug, sector) : null;
  if (!sector || !industry) return { title: "行业不存在 — GekkoTech" };
  const sectorDef = getSectorDef(sector);
  return {
    title: `${industry.nameEn}（${sectorDef.nameZh}）行业收益与成分股 — GekkoTech`,
    description: `${sectorDef.nameZh} · ${industry.nameEn} 细分行业的收益表现、财报叙事与成分股一览。`,
    alternates: { canonical: absoluteUrl(`/equity/sectors/${sectorSlug}/industries/${industrySlug}`) },
  };
}

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

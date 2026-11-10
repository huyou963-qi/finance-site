import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSectorDef, sectorFromSlug } from "@/lib/equity/gicsCatalog";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { EquitySectorDetailClient } from "./EquitySectorDetailClient";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sector: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tr = await getServerTr();
  const { sector: slug } = await params;
  const sector = sectorFromSlug(slug);
  if (!sector) return { title: tr("行业不存在 — GekkoTech") };
  const def = getSectorDef(sector);
  return {
    title: tr("{nameZh}（{sector}）行业收益、财报与成分股 — GekkoTech", { nameZh: def.nameZh, sector: def.sector }),
    description: tr("{nameZh}板块（对标 {etf}）的收益表现、财报叙事与成分股一览。", { nameZh: def.nameZh, etf: def.etf }),
    alternates: { canonical: absoluteUrl(`/equity/sectors/${slug}`) },
  };
}

export default async function EquitySectorDetailPage({ params }: Props) {
  const tr = await getServerTr();
  const { sector } = await params;
  return (
    <FeatureGate featureId="equity-sectors">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">{tr("加载中…")}</div>
        }
      >
        <EquitySectorDetailClient sectorSlug={sector} />
      </Suspense>
    </FeatureGate>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { FeatureLocked } from "@/components/access/FeatureLocked";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { StockDetailClient } from "./StockDetailClient";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const stock = await loadStockContext(symbol);
  if (!stock) return { title: "股票不存在 — GekkoTech" };

  const scope = [stock.sectorDef?.nameZh, stock.industry?.nameEn].filter(Boolean).join(" · ");
  return {
    title: `${stock.name}（${stock.symbol}）股价、财务与行业对比 — GekkoTech`,
    description: scope
      ? `${stock.name} ${stock.symbol} 属于 ${scope} 板块，提供 K 线行情、基本面数据与同行业个股对比。`
      : `${stock.name} ${stock.symbol} 的 K 线行情与基本面数据。`,
    alternates: { canonical: absoluteUrl(`/equity/stocks/${stock.symbol}`) },
  };
}

export default async function StockDetailPage({ params }: Props) {
  const gate = await checkFeatureAccess("markets");
  if (gate.state !== "allowed") {
    return (
      <FeatureLocked featureId="markets" state={gate.state} viewer={gate.viewer} />
    );
  }
  const { symbol } = await params;
  const stock = await loadStockContext(symbol);
  if (!stock) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: stock.name,
    tickerSymbol: stock.symbol,
    url: absoluteUrl(`/equity/stocks/${stock.symbol}`),
    ...(stock.website ? { sameAs: [stock.website] } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-fs-muted">
            加载中…
          </div>
        }
      >
        <StockDetailClient
          symbol={stock.symbol}
          name={stock.name}
          sectorSlug={stock.sectorSlug}
          sectorNameZh={stock.sectorDef?.nameZh ?? null}
          industrySlug={stock.industrySlug}
          industryName={stock.industry?.nameEn ?? null}
          gicsSubIndustry={stock.gicsSubIndustry}
          marketCap={stock.marketCap}
        />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadStockContext } from "@/lib/equity/stockDetail";
import { StockDetailClient } from "./StockDetailClient";

type Props = { params: Promise<{ symbol: string }> };

export default async function StockDetailPage({ params }: Props) {
  const { symbol } = await params;
  const stock = await loadStockContext(symbol);
  if (!stock) notFound();

  return (
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
  );
}

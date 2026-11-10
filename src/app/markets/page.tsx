import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getServerTr } from "@/i18n/serverText";
import { MarketsClient } from "./MarketsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tr = await getServerTr();
  return {
    title: tr("多资产行情 — 股票、期货、外汇与指数 — GekkoTech"),
    description: tr("美股、期货、外汇与指数的 K 线行情一览，支持个股下钻与跨资产对比。"),
  };
}

export default function MarketsPage() {
  return (
    <FeatureGate featureId="markets">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <MarketsClient />
      </div>
    </FeatureGate>
  );
}

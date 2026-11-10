import { FeatureGate } from "@/components/access/FeatureGate";
import { StockDataWorkspace } from "@/components/stockData/StockDataWorkspace";
import { getServerTr } from "@/i18n/serverText";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("股票数据 | GekkoTech") };
}

export default async function StockDataPage() {
  return (
    <FeatureGate featureId="equity-stock-data">
      <StockDataWorkspace />
    </FeatureGate>
  );
}

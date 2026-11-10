import { FeatureGate } from "@/components/access/FeatureGate";
import { StockDataWorkspace } from "@/components/stockData/StockDataWorkspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "股票数据 | GekkoTech" };

export default function StockDataPage() {
  return (
    <FeatureGate featureId="equity-stock-data">
      <StockDataWorkspace />
    </FeatureGate>
  );
}

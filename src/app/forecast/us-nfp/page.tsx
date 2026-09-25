import { FeatureGate } from "@/components/access/FeatureGate";
import { UsNfpNowcastView } from "@/components/forecast/UsNfpNowcastView";
import { getUsNfpNowcast } from "@/lib/forecast/usNfp/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "美国非农就业预测" };

/** 放在 FeatureGate 内：无权访问时不触发模型计算 */
async function UsNfpNowcastSection() {
  const payload = await getUsNfpNowcast();
  return <UsNfpNowcastView data={payload} />;
}

export default function UsNfpForecastPage() {
  return (
    <FeatureGate featureId="forecast-us-nfp">
      <UsNfpNowcastSection />
    </FeatureGate>
  );
}

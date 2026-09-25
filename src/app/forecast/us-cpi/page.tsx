import { FeatureGate } from "@/components/access/FeatureGate";
import { UsCpiNowcastView } from "@/components/forecast/UsCpiNowcastView";
import { getUsCpiNowcast } from "@/lib/forecast/usCpi/service";

export const dynamic = "force-dynamic";

export const metadata = { title: "美国 CPI 预测" };

/** 放在 FeatureGate 内：无权访问时不触发模型计算 */
async function UsCpiNowcastSection() {
  const payload = await getUsCpiNowcast();
  return <UsCpiNowcastView data={payload} />;
}

export default function UsCpiForecastPage() {
  return (
    <FeatureGate featureId="forecast-us-cpi">
      <UsCpiNowcastSection />
    </FeatureGate>
  );
}

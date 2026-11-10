import { FeatureGate } from "@/components/access/FeatureGate";
import { getServerTr } from "@/i18n/serverText";
import { UsCpiModelDetails } from "@/components/forecast/UsCpiModelDetails";
import { UsCpiNowcastView } from "@/components/forecast/UsCpiNowcastView";
import { getViewerFromCookies } from "@/lib/access/featureAccess";
import { getUsCpiNowcast, toPublicUsCpiPayload } from "@/lib/forecast/usCpi/service";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("美国 CPI 预测") };
}

/** 放在 FeatureGate 内：无权访问时不触发模型计算。核心算法只在管理员的服务端渲染。 */
async function UsCpiNowcastSection() {
  const [payload, viewer] = await Promise.all([getUsCpiNowcast(), getViewerFromCookies()]);
  return (
    <>
      <UsCpiNowcastView data={toPublicUsCpiPayload(payload)} />
      {viewer.role === "admin" ? (
        <UsCpiModelDetails model={payload.model} latestCpiMonth={payload.latestCpiMonth} />
      ) : null}
    </>
  );
}

export default function UsCpiForecastPage() {
  return (
    <FeatureGate featureId="forecast-us-cpi">
      <UsCpiNowcastSection />
    </FeatureGate>
  );
}

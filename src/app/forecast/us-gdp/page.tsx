import { FeatureGate } from "@/components/access/FeatureGate";
import { getServerTr } from "@/i18n/serverText";
import { UsGdpModelDetails } from "@/components/forecast/UsGdpModelDetails";
import { UsGdpNowcastView } from "@/components/forecast/UsGdpNowcastView";
import { getViewerFromCookies } from "@/lib/access/featureAccess";
import { getUsGdpNowcast, toPublicUsGdpPayload } from "@/lib/forecast/usGdp/service";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("美国 GDP Now") };
}

/** 放在 FeatureGate 内：无权访问时不触发模型计算。核心算法只在管理员的服务端渲染。 */
async function UsGdpNowcastSection() {
  const [payload, viewer] = await Promise.all([getUsGdpNowcast(), getViewerFromCookies()]);
  return (
    <>
      <UsGdpNowcastView data={toPublicUsGdpPayload(payload)} />
      {viewer.role === "admin" ? <UsGdpModelDetails model={payload.model} /> : null}
    </>
  );
}

export default function UsGdpForecastPage() {
  return (
    <FeatureGate featureId="forecast-us-gdp">
      <UsGdpNowcastSection />
    </FeatureGate>
  );
}

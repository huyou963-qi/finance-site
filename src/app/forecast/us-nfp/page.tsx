import { FeatureGate } from "@/components/access/FeatureGate";
import { getServerTr } from "@/i18n/serverText";
import { UsNfpModelDetails } from "@/components/forecast/UsNfpModelDetails";
import { UsNfpNowcastView } from "@/components/forecast/UsNfpNowcastView";
import { getViewerFromCookies } from "@/lib/access/featureAccess";
import { getUsNfpNowcast, toPublicUsNfpPayload } from "@/lib/forecast/usNfp/service";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tr = await getServerTr();
  return { title: tr("美国非农就业预测") };
}

/** 放在 FeatureGate 内：无权访问时不触发模型计算。核心算法只在管理员的服务端渲染。 */
async function UsNfpNowcastSection() {
  const [payload, viewer] = await Promise.all([getUsNfpNowcast(), getViewerFromCookies()]);
  return (
    <>
      <UsNfpNowcastView data={toPublicUsNfpPayload(payload)} />
      {viewer.role === "admin" ? <UsNfpModelDetails model={payload.model} /> : null}
    </>
  );
}

export default function UsNfpForecastPage() {
  return (
    <FeatureGate featureId="forecast-us-nfp">
      <UsNfpNowcastSection />
    </FeatureGate>
  );
}

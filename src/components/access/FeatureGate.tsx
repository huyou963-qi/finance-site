import type { ReactNode } from "react";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { FeatureLocked } from "@/components/access/FeatureLocked";

/**
 * 服务端功能页守卫：包住页面内容即可。管理员配置为不可见时渲染锁定页而非内容。
 * 用法：`<FeatureGate featureId="weekly">{...}</FeatureGate>`（页面因读 cookie 变为动态渲染）。
 */
export async function FeatureGate({
  featureId,
  children,
}: {
  featureId: string;
  children: ReactNode;
}) {
  const gate = await checkFeatureAccess(featureId);
  if (!gate.allowed) {
    return <FeatureLocked featureId={featureId} needsPro={gate.needsPro} viewer={gate.viewer} />;
  }
  return <>{children}</>;
}

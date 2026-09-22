import type { ReactNode } from "react";
import { checkFeatureAccess } from "@/lib/access/featureAccess";
import { FeatureLocked } from "@/components/access/FeatureLocked";

/**
 * 服务端功能页守卫：包住页面内容即可。无权访问时按原因渲染占位页
 * （开发中 / 游客注册引导 / 普通用户升级引导）而非内容。
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
  if (gate.state !== "allowed") {
    return <FeatureLocked featureId={featureId} state={gate.state} viewer={gate.viewer} />;
  }
  return <>{children}</>;
}

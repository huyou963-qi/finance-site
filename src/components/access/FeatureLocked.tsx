import Link from "next/link";
import type { ReactNode } from "react";
import { TRIAL_DAYS } from "@/lib/billing/pricing";
import {
  getFeatureDefinition,
  type FeatureAccessState,
  type FeatureViewer,
} from "@/lib/access/featureCatalog";

const primaryBtn =
  "rounded-md border border-fs-accent/40 bg-fs-accent-soft px-4 py-2 text-sm font-medium text-fs-accent-text";
const secondaryBtn = "rounded-md border border-fs-border px-4 py-2 text-sm text-fs-secondary";

/**
 * 功能页无权访问时的占位页，按原因给不同引导：
 * - hidden：功能开发中，暂未开放
 * - needs-register：游客访问 Pro 功能 → 注册即送 7 天 Pro 试用
 * - needs-upgrade：普通用户访问 Pro 功能 → 升级 Pro（区分试用已结束）
 */
export function FeatureLocked({
  featureId,
  state,
  viewer,
}: {
  featureId: string;
  state: Exclude<FeatureAccessState, "allowed">;
  viewer: FeatureViewer;
}) {
  const name = getFeatureDefinition(featureId)?.label ?? "该功能";

  let badge: string;
  let title: string;
  let body: string;
  let actions: ReactNode;

  if (state === "hidden") {
    badge = "开发中";
    title = `${name}正在开发中`;
    body = "该功能尚未对外开放，完成后会第一时间上线，敬请期待。";
    actions = (
      <Link href="/" className={secondaryBtn}>
        返回首页
      </Link>
    );
  } else if (state === "needs-register") {
    badge = "Pro 功能";
    title = `${name}是 Pro 会员功能`;
    body = `注册即可免费试用 ${TRIAL_DAYS} 天 Pro，试用期内可使用全部 Pro 功能，无需付费。`;
    actions = (
      <>
        <Link href="/auth?register=1" className={primaryBtn}>
          免费注册，试用 {TRIAL_DAYS} 天
        </Link>
        <Link href="/auth" className={secondaryBtn}>
          已有账号，登录
        </Link>
        <Link href="/pricing" className={secondaryBtn}>
          了解 Pro 权益
        </Link>
      </>
    );
  } else {
    badge = "Pro 功能";
    title = `${name}是 Pro 会员功能`;
    body = viewer.trialEnded
      ? `你的 ${TRIAL_DAYS} 天 Pro 试用已结束，升级 Pro 后即可继续使用。`
      : "升级 Pro 会员后即可使用该功能。";
    actions = (
      <>
        <Link href="/pricing" className={primaryBtn}>
          升级 Pro
        </Link>
        <Link href="/" className={secondaryBtn}>
          返回首页
        </Link>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <span className="rounded-full border border-fs-accent/30 bg-fs-accent-soft px-2.5 py-0.5 text-xs font-medium text-fs-accent-text">
        {badge}
      </span>
      <h1 className="text-lg font-semibold text-fs-text">{title}</h1>
      <p className="text-sm leading-6 text-fs-muted">{body}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>
    </div>
  );
}

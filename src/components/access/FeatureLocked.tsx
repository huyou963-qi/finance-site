import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { TRIAL_DAYS } from "@/lib/billing/pricing";
import {
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
export async function FeatureLocked({
  featureId,
  state,
  viewer,
}: {
  featureId: string;
  state: Exclude<FeatureAccessState, "allowed">;
  viewer: FeatureViewer;
}) {
  const t = await getTranslations("access");
  const tc = await getTranslations("common");
  const names = await getTranslations("features");
  type FeatureKey = Parameters<typeof names>[0];
  const name = names.has(featureId as FeatureKey) ? names(featureId as FeatureKey) : t("thisFeature");
  const days = TRIAL_DAYS;

  let badge: string;
  let title: string;
  let body: string;
  let actions: ReactNode;

  if (state === "hidden") {
    badge = t("badgeDevelopment");
    title = t("developmentTitle", { name });
    body = t("developmentBody");
    actions = (
      <Link href="/" className={secondaryBtn}>
        {tc("backHome")}
      </Link>
    );
  } else if (state === "needs-register") {
    badge = t("badgePro");
    title = t("proTitle", { name });
    body = t("registerBody", { days });
    actions = (
      <>
        <Link href="/auth?register=1" className={primaryBtn}>
          {t("registerCta", { days })}
        </Link>
        <Link href="/auth" className={secondaryBtn}>
          {t("loginCta")}
        </Link>
        <Link href="/pricing" className={secondaryBtn}>
          {t("learnPro")}
        </Link>
      </>
    );
  } else {
    badge = t("badgePro");
    title = t("proTitle", { name });
    body = viewer.trialEnded ? t("trialEndedBody", { days }) : t("upgradeBody");
    actions = (
      <>
        <Link href="/pricing" className={primaryBtn}>
          {t("upgradeCta")}
        </Link>
        <Link href="/" className={secondaryBtn}>
          {tc("backHome")}
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

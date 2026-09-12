import Link from "next/link";
import { getFeatureDefinition } from "@/lib/access/featureCatalog";
import type { FeatureViewer } from "@/lib/access/featureCatalog";

/**
 * 功能页被管理员对当前身份关闭时的占位页。
 * needsPro=true 表示只是「该功能仅对 Pro 开放」，给升级引导；否则只说明未开放。
 */
export function FeatureLocked({
  featureId,
  needsPro,
  viewer,
}: {
  featureId: string;
  needsPro: boolean;
  viewer: FeatureViewer;
}) {
  const def = getFeatureDefinition(featureId);
  const name = def?.label ?? "该功能";
  const anonymous = viewer.role === null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-fs-text">{name}暂未对你开放</h1>
      <p className="text-sm text-fs-muted">
        {needsPro
          ? `${name}目前仅对 Pro 会员（含 7 天试用）开放。`
          : `${name}当前未对你的账户开放，如需使用请联系管理员。`}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {needsPro ? (
          <Link
            href="/pricing"
            className="rounded-md border border-fs-accent/40 bg-fs-accent-soft px-3 py-1.5 text-sm text-fs-accent-text"
          >
            查看 Pro 权益
          </Link>
        ) : null}
        {anonymous ? (
          <Link
            href="/auth"
            className="rounded-md border border-fs-border px-3 py-1.5 text-sm text-fs-secondary"
          >
            登录 / 注册
          </Link>
        ) : null}
        <Link
          href="/"
          className="rounded-md border border-fs-border px-3 py-1.5 text-sm text-fs-secondary"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

/**
 * 对外规范域名。会被静态预渲染的位置（如根布局 metadata）只能用这个字面量：
 * 预渲染产物在 CI 里构建、直接打包上线（服务器不跑 next build），那时
 * APP_BASE_URL 是 localhost，读环境变量会把错误地址固化进线上 HTML。
 * 运行时代码请用 getSiteUrl() / absoluteUrl()。
 */
export const CANONICAL_SITE_URL = "https://www.gekkotech.cn";

/**
 * 站点默认分享图，用于没有自带配图的页面。
 * 必须是无 alpha 的 JPEG：社交卡片渲染器无法把带透明通道的图合成到卡片背景上，
 * 会直接弃用并把大图卡降级成无图小卡（X 上实测过）。
 */
export const DEFAULT_OG_IMAGE = {
  path: "/brand/og-default.jpg",
  width: 1200,
  height: 630,
  alt: "GekkoTech — 宏观与行情研究",
} as const;

/** 站点对外根地址（无尾斜杠）；与邮件确认链接共用 APP_BASE_URL。 */
export function getSiteUrl(): string {
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${getSiteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isLocalSiteUrl(siteUrl: string): boolean {
  try {
    const host = new URL(siteUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch {
    return true;
  }
}

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

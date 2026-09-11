import type { MetadataRoute } from "next";
import { collectSitemapEntries } from "@/lib/seo/sitemapEntries";

// 读 DB + 运行时 APP_BASE_URL，不在 build 期固化
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return collectSitemapEntries();
}

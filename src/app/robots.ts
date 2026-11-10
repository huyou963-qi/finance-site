import type { MetadataRoute } from "next";
import { localizeHref } from "@/i18n/locales";
import { absoluteUrl } from "@/lib/seo/siteUrl";

/** 不给搜索引擎收录的路径；英文版 /en/... 同样屏蔽 */
const PRIVATE_PATHS = ["/admin", "/auth", "/articles/editor", "/investments"];

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /api 不屏蔽：百度蜘蛛渲染页面时需要拉数据接口
      disallow: PRIVATE_PATHS.flatMap((p) => [p, localizeHref(p, "en")]),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

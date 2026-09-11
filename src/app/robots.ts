import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /api 不屏蔽：百度蜘蛛渲染页面时需要拉数据接口
      disallow: ["/admin", "/auth", "/articles/editor", "/investments"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

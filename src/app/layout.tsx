import type { Metadata } from "next";
import { SiteHeaderShell } from "@/components/SiteHeaderShell";
import { GlobalErrorListeners } from "@/components/errors/GlobalErrorListeners";
import { BaiduPageView } from "@/components/analytics/BaiduPageView";
import { BaiduTongjiScript } from "@/components/analytics/BaiduTongjiScript";
import "./globals.css";

/** 百度搜索资源平台「HTML 标签验证」的 content 值（codeva-xxx） */
const baiduSiteVerification = process.env.BAIDU_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  title: "GekkoTech — 宏观与行情研究",
  description: "宏观仪表盘、多资产行情与 AI 周度观察",
  // 这里只放静态常量：根布局会被静态预渲染，而 CI 构建产物直接打包上线
  // （服务器不跑 next build），任何读 APP_BASE_URL 的值都会被固化成构建时的 localhost。
  // 需要绝对地址的 og:url 交给 force-dynamic 的具体页面在运行时生成。
  openGraph: {
    siteName: "GekkoTech",
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    site: "@GekkoQ30180",
  },
  ...(baiduSiteVerification
    ? { verification: { other: { "baidu-site-verification": baiduSiteVerification } } }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body
        className="flex h-full min-h-0 flex-col antialiased"
        suppressHydrationWarning
      >
        <SiteHeaderShell />
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-1 pb-3">
          {children}
        </main>
        <GlobalErrorListeners />
        <BaiduPageView />
        <BaiduTongjiScript />
      </body>
    </html>
  );
}

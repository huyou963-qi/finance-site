import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SiteHeaderShell } from "@/components/SiteHeaderShell";
import { GlobalErrorListeners } from "@/components/errors/GlobalErrorListeners";
import { BaiduPageView } from "@/components/analytics/BaiduPageView";
import { BaiduTongjiScript } from "@/components/analytics/BaiduTongjiScript";
import { CANONICAL_SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo/siteUrl";
import { HTML_LANG, localizeHref } from "@/i18n/locales";
import { getRequestLocale, isEnglishPublic } from "@/i18n/server";
import "./globals.css";

/** 百度搜索资源平台「HTML 标签验证」的 content 值（codeva-xxx） */
const baiduSiteVerification = process.env.BAIDU_SITE_VERIFICATION?.trim();

export async function generateMetadata(): Promise<Metadata> {
  const { locale, pathname } = await getRequestLocale();
  const t = await getTranslations("meta");
  // 英文对所有人上线后才向搜索引擎声明中英文版本；子页面若自设 alternates 会整体覆盖这里。
  const alternates = (await isEnglishPublic())
    ? {
        canonical: localizeHref(pathname, locale),
        languages: {
          "zh-CN": localizeHref(pathname, "zh"),
          en: localizeHref(pathname, "en"),
          "x-default": localizeHref(pathname, "zh"),
        },
      }
    : undefined;
  return {
    // 不读 APP_BASE_URL：CI 构建产物直接打包上线（服务器不跑 next build），用常量最稳。
    // metadataBase 负责把相对图片路径与 alternates 补成绝对地址。
    metadataBase: new URL(CANONICAL_SITE_URL),
    title: t("title"),
    description: t("description"),
    ...(alternates ? { alternates } : {}),
    openGraph: {
      siteName: "GekkoTech",
      type: "website",
      locale: locale === "en" ? "en_US" : "zh_CN",
      // 带上尺寸，抓取方不必下载图片就能判定可用大图卡。
      images: [
        {
          url: DEFAULT_OG_IMAGE.path,
          width: DEFAULT_OG_IMAGE.width,
          height: DEFAULT_OG_IMAGE.height,
          alt: DEFAULT_OG_IMAGE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@GekkoQ30180",
      images: [{ url: DEFAULT_OG_IMAGE.path, alt: DEFAULT_OG_IMAGE.alt }],
    },
    ...(baiduSiteVerification
      ? { verification: { other: { "baidu-site-verification": baiduSiteVerification } } }
      : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 语言来自网址前缀（middleware 写请求头），因此根布局按请求渲染。
  const { requested, locale, pathname } = await getRequestLocale();
  // 英文未对当前身份开放：清掉英文偏好并回到中文页（经 API 清 cookie，避免与 middleware 互相重定向）
  if (requested !== locale) redirect(`/api/i18n/reset?to=${encodeURIComponent(pathname)}`);
  return (
    <html lang={HTML_LANG[locale]} className="h-full" suppressHydrationWarning>
      <body
        className="flex h-full min-h-0 flex-col antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider>
          <SiteHeaderShell />
          <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-1 pb-3">
            {children}
          </main>
        </NextIntlClientProvider>
        <GlobalErrorListeners />
        <BaiduPageView />
        <BaiduTongjiScript />
      </body>
    </html>
  );
}

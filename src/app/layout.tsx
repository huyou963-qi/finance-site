import type { Metadata } from "next";
import { SiteHeaderShell } from "@/components/SiteHeaderShell";
import { GlobalErrorListeners } from "@/components/errors/GlobalErrorListeners";
import { ReportBugButton } from "@/components/errors/ReportBugButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finova — 宏观与行情研究",
  description: "宏观仪表盘、多资产行情与 AI 周度观察",
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
        <ReportBugButton />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance site — macro & markets",
  description: "Macro dashboards and candlestick charts (local dev scaffold)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="flex h-full min-h-0 flex-col antialiased">
        <header className="shrink-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex w-full flex-wrap items-center gap-5 px-4 py-2 lg:px-6">
            <Link
              href="/macro"
              className="shrink-0 font-semibold tracking-tight text-slate-100 hover:text-white"
            >
              Finance site
            </Link>
            <SiteHeaderNav />
          </div>
        </header>
        <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto pt-1 pb-3">
          {children}
        </main>
      </body>
    </html>
  );
}

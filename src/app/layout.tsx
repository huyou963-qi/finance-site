import type { Metadata } from "next";
import Link from "next/link";
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
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <Link href="/" className="font-semibold tracking-tight text-slate-100">
              Finance site
            </Link>
            <nav className="flex gap-4 text-sm text-slate-400">
              <Link href="/macro" className="hover:text-slate-100">
                宏观
              </Link>
              <Link href="/markets" className="hover:text-slate-100">
                K 线
              </Link>
            </nav>
          </div>
        </header>
        <main className="w-full py-8">{children}</main>
      </body>
    </html>
  );
}

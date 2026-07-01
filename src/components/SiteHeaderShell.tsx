"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";

/** 首页自带顶栏，其余页面使用全站顶栏 */
export function SiteHeaderShell() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <header className="shrink-0 border-b border-fs-border bg-white/95 backdrop-blur">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 lg:px-6">
        <Link href="/" className="shrink-0">
          <FinovaWordmark size="sm" />
        </Link>
        <SiteHeaderNav />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { FinovaWordmark } from "@/components/brand/FinovaWordmark";
import { SiteHeaderNav } from "@/components/SiteHeaderNav";

export function SiteHeaderShell() {
  return (
    <header className="relative z-[100] shrink-0 border-b border-fs-border bg-white/95 backdrop-blur">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 lg:px-6">
        <Link href="/" className="shrink-0">
          <FinovaWordmark size="sm" />
        </Link>
        <SiteHeaderNav />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";

export const QUANT_NAV = [
  { href: "/quant/regime", label: "Regime", featureId: "quant-regime" },
  { href: "/quant/factor-research", label: "因子研究", featureId: "quant-factor-research" },
  { href: "/quant/screener", label: "选股器", featureId: "quant-screener" },
  { href: "/quant/backtest", label: "回测", featureId: "quant-backtest" },
  { href: "/quant/robustness", label: "稳健性", featureId: "quant-robustness" },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function QuantSidebarNav() {
  const pathname = usePathname();
  const features = useVisibleFeatures();

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="量化研究分页">
      {QUANT_NAV.filter((item) => features.can(item.featureId)).map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-2.5 py-1.5 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50 ${
              active
                ? "bg-fs-accent-soft font-medium text-fs-accent-text"
                : "text-fs-muted hover:bg-fs-elevated hover:text-fs-text"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

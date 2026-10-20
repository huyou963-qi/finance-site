"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";

export const FORECAST_NAV = [
  { href: "/forecast/us-cpi", label: "美国 CPI 预测", featureId: "forecast-us-cpi" },
  { href: "/forecast/us-nfp", label: "美国非农预测", featureId: "forecast-us-nfp" },
] as const;

export function ForecastSidebarNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const features = useVisibleFeatures();

  return (
    <nav
      className={mobile ? "flex gap-1 overflow-x-auto border-b border-fs-border p-2" : "flex flex-col gap-0.5 p-3"}
      aria-label="指标预测分页"
    >
      {FORECAST_NAV.filter((item) => features.can(item.featureId)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-fs-accent/50 ${
              mobile ? "shrink-0 px-3 py-2.5" : "px-2.5 py-1.5"
            } ${
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

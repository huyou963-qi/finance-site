"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVisibleFeatures } from "@/hooks/useVisibleFeatures";

export const FORECAST_NAV = [
  { href: "/forecast/us-cpi", label: "美国 CPI 预测", featureId: "forecast-us-cpi" },
  { href: "/forecast/us-nfp", label: "美国非农预测", featureId: "forecast-us-nfp" },
] as const;

export function ForecastSidebarNav() {
  const pathname = usePathname();
  const features = useVisibleFeatures();

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="指标预测分页">
      {FORECAST_NAV.filter((item) => features.can(item.featureId)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

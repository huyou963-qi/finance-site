import { Suspense } from "react";
import type { Metadata } from "next";
import { FeatureGate } from "@/components/access/FeatureGate";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { IndustryFinancialsClient } from "./IndustryFinancialsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "美股行业 — 行业 ETF 历史财务与成分公司 — GekkoTech",
  description: "按11只行业ETF观察历史营收、利润率和现金流，支持单季、TTM及公司基本面下钻。",
  alternates: { canonical: absoluteUrl("/equity/industries") },
};

export default function IndustryFinancialsPage() {
  return <FeatureGate featureId="equity-industries"><Suspense fallback={<div className="p-6 text-sm text-fs-muted">正在加载美股行业…</div>}><IndustryFinancialsClient /></Suspense></FeatureGate>;
}

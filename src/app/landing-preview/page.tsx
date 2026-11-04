import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LandingPreviewGallery } from "@/components/landing-preview/LandingPreviewGallery";
import { canViewDesignPreview } from "@/lib/access/designPreview";

export const metadata = {
  title: "Landing Preview — GekkoTech 设计稿对比",
  description: "首页科幻风多版本设计预览：AI · Finance · Data-driven",
};

export default async function LandingPreviewPage() {
  if (!(await canViewDesignPreview())) notFound();
  return (
    <Suspense fallback={<div className="px-6 py-10 text-sm text-fs-secondary">加载预览…</div>}>
      <LandingPreviewGallery />
    </Suspense>
  );
}

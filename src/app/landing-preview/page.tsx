import { Suspense } from "react";
import { LandingPreviewGallery } from "@/components/landing-preview/LandingPreviewGallery";

export const metadata = {
  title: "Landing Preview — Finova 设计稿对比",
  description: "首页科幻风多版本设计预览：AI · Finance · Data-driven",
};

export default function LandingPreviewPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-sm text-fs-secondary">加载预览…</div>}>
      <LandingPreviewGallery />
    </Suspense>
  );
}

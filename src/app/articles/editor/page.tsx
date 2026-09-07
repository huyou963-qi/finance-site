import type { Metadata } from "next";
import { Suspense } from "react";
import { ArticleEditorClient } from "./ArticleEditorClient";

export const metadata: Metadata = { title: "发布文章 — Finova" };

export default function ArticleEditorPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-fs-muted">加载文章工作台…</div>}>
      <ArticleEditorClient />
    </Suspense>
  );
}

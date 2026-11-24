"use client";

import { useState } from "react";
import { useTr } from "@/i18n/TextProvider";

export function ApplyUsFiscalTemplates() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const tr = useTr();
  async function apply() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/tools/macro-chart-prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applyUsFiscalTemplates: true }),
      });
      if (!response.ok)
        throw new Error(`Template update failed: ${response.status}`);
      window.location.reload();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <div className="my-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={apply}
        className="rounded-md border border-fs-accent/30 bg-fs-accent-soft px-3 py-2 text-xs font-medium text-fs-accent-text disabled:opacity-50"
      >
        {pending ? tr("正在更新美国财政模板…") : tr("应用三套美国财政模板")}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-fs-negative">
          {tr("美国财政模板更新失败，请重试")}
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type DisclosureData = {
  announcements: { accession: string; form: string; date: string; url: string; collectedAt: string;
    isEarnings: boolean; attachments: { filename: string; url: string; text: string }[] }[];
  financial: { form: string; date: string; url: string; status: string | null; processedAt: string | null } | null;
};

function localTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function StockDisclosureCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<DisclosureData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(false);
    fetch(`/api/equity/stocks/${encodeURIComponent(symbol)}/disclosures`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("load failed"); return response.json() as Promise<DisclosureData>; })
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [symbol]);

  return <section aria-label="最新公告与财报" className="min-w-0 rounded-lg border border-fs-border bg-fs-bg p-3 sm:p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">最新公告与财报</h2>
      <span className="text-xs text-fs-muted">每日批量更新 · 公告日期按美东</span>
    </div>
    {error ? <p role="status" className="mt-2 text-xs text-fs-muted">公告暂时无法加载，请稍后刷新页面。</p>
      : !data ? <p className="mt-2 text-xs text-fs-muted">正在读取公告…</p>
      : <>
        {data.financial ? <p className="mt-2 break-words text-xs leading-6 text-fs-muted">
          最近定期报告：<a href={data.financial.url} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">{data.financial.date} {data.financial.form} ↗</a>
          {" · "}{data.financial.status === "complete" ? "标准化财务已更新" : data.financial.status === "error" ? "财务更新失败，后续批次重试" : data.financial.status === "pending" ? "完整财务数据待补齐" : "日批尚未核验财务更新"}
          {data.financial.processedAt ? ` · ${data.financial.status === "complete" ? "完成" : "检查"}时间：${localTime(data.financial.processedAt)}（北京）` : ""}
        </p> : null}
        {data.announcements.length ? <ul className="mt-2 divide-y divide-fs-border">
          {data.announcements.map(item => <li key={item.accession} className="min-w-0 py-2 text-xs leading-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-words text-fs-accent-text hover:underline">{item.date} · {item.form}{item.isEarnings ? " · 业绩发布" : ""} ↗</a>
              <span className="text-fs-muted">入库：{localTime(item.collectedAt)}（北京）</span>
            </div>
            {item.attachments.map(attachment => <details key={attachment.url} className="mt-1 rounded border border-fs-border px-2">
              <summary className="cursor-pointer break-all text-fs-accent-text">公告附件 · {attachment.filename}</summary>
              <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-fs-accent-text hover:underline">查看 SEC 附件原文 ↗</a>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-fs-muted">{attachment.text || "此附件暂无可展示文本，请查看原文。"}</p>
              <p className="text-fs-muted">原文摘录，最多展示 20,000 字符；财务口径以正式报告为准。</p>
            </details>)}
          </li>)}
        </ul> : <p className="mt-2 text-xs text-fs-muted">暂无已入库公告。每日任务覆盖已登记 CIK 公司的 8-K、10-Q、10-K 及修订版。</p>}
      </>}
  </section>;
}

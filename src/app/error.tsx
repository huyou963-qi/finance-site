"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reportHint, setReportHint] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void reportClientError({
      source: "auto_crash",
      message: error.message || "页面渲染错误",
      stack: error.stack,
      digest: error.digest,
      metadata: { name: error.name },
    });
  }, [error]);

  const sendManual = async () => {
    setSending(true);
    setReportHint(null);
    const result = await reportClientError({
      source: "manual",
      message: error.message || "页面渲染错误",
      stack: error.stack,
      digest: error.digest,
      userNote: note.trim() || undefined,
      metadata: { name: error.name, from: "error.tsx" },
    });
    setSending(false);
    if (result.error) setReportHint("上报失败：" + result.error);
    else setReportHint("已提交，感谢反馈");
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-fs-text">
      <h1 className="text-xl font-semibold">出错了</h1>
      <p className="text-sm text-fs-muted">
        页面加载或渲染时发生错误。错误信息已自动发送给维护人员，你也可以补充说明后再次报告。
      </p>
      <p className="rounded border border-fs-border bg-fs-elevated px-3 py-2 font-mono text-xs break-all text-fs-muted">
        {error.message || "未知错误"}
        {error.digest ? " | digest " + error.digest : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-fs-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          重试
        </button>
        <button
          type="button"
          onClick={() => setShowNote((v) => !v)}
          className="rounded border border-fs-border px-3 py-1.5 text-sm hover:bg-fs-elevated"
        >
          报告问题
        </button>
      </div>
      {showNote ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="可选：描述你当时在做什么"
            className="w-full rounded border border-fs-border bg-fs-bg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendManual()}
            className="self-start rounded border border-fs-border px-3 py-1.5 text-sm hover:bg-fs-elevated disabled:opacity-50"
          >
            {sending ? "提交中" : "提交补充说明"}
          </button>
        </div>
      ) : null}
      {reportHint ? <p className="text-sm text-fs-muted">{reportHint}</p> : null}
    </div>
  );
}

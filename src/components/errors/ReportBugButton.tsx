"use client";

import { useState } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";

/** 角区「报告问题」入口，供非崩溃场景手动反馈。 */
export function ReportBugButton() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const msg = message.trim() || "用户手动报告问题";
    setSending(true);
    setHint(null);
    const result = await reportClientError({
      source: "manual",
      message: msg,
      userNote: note.trim() || undefined,
      metadata: { from: "ReportBugButton" },
    });
    setSending(false);
    if (result.error) {
      setHint("提交失败：" + result.error);
      return;
    }
    setHint("已提交，感谢反馈");
    setMessage("");
    setNote("");
    setTimeout(() => setOpen(false), 800);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setHint(null);
        }}
        className="fixed bottom-4 right-4 z-40 rounded border border-fs-border bg-fs-bg/95 px-3 py-1.5 text-xs text-fs-muted shadow-sm backdrop-blur hover:text-fs-text"
        title="向维护人员报告问题"
      >
        报告问题
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="报告问题"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-fs-border bg-fs-bg p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-base font-semibold text-fs-text">报告问题</h2>
            <p className="mb-3 text-xs text-fs-muted">
              描述你遇到的异常，我们会把当前页面与浏览器信息一并发送给维护人员。
            </p>
            <label className="mb-1 block text-xs text-fs-muted">简要说明（必填）</label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mb-3 w-full rounded border border-fs-border bg-fs-elevated px-3 py-2 text-sm"
              placeholder="例如：宏观图加载失败 / 登录按钮无响应"
              maxLength={500}
            />
            <label className="mb-1 block text-xs text-fs-muted">补充说明（可选）</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded border border-fs-border bg-fs-elevated px-3 py-2 text-sm"
              placeholder="复现步骤、期望结果等"
              maxLength={2000}
            />
            {hint ? <p className="mb-2 text-xs text-fs-muted">{hint}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-fs-border px-3 py-1.5 text-sm hover:bg-fs-elevated"
              >
                取消
              </button>
              <button
                type="button"
                disabled={sending || !message.trim()}
                onClick={() => void submit()}
                className="rounded bg-fs-accent px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "提交中" : "提交"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

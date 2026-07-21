"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  fileToReportImage,
  reportClientError,
  type ClientReportImage,
} from "@/lib/errorReports/clientReport";
import { MAX_IMAGES } from "@/lib/errorReports/types";

type FeedbackKind = "bug" | "feature";

/**
 * 顶栏反馈入口。触发按钮留在 header；弹层必须 portal 到 body。
 * header 使用了 backdrop-blur，会形成 fixed 定位包含块，若不 portal，
 * 弹窗会相对顶栏居中而贴在视口顶部。
 */
export function ReportBugButton() {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<ClientReportImage[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const resetForm = useCallback(() => {
    setKind("bug");
    setMessage("");
    setNote("");
    setImages([]);
    setPreviews((prev) => {
      for (const u of prev) URL.revokeObjectURL(u);
      return [];
    });
    setHint(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    resetForm();
  }, [resetForm]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setHint(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setHint(`最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    const picked = [...files].slice(0, room);
    try {
      const next: ClientReportImage[] = [];
      const urls: string[] = [];
      for (const f of picked) {
        next.push(await fileToReportImage(f));
        urls.push(URL.createObjectURL(f));
      }
      setImages((prev) => [...prev, ...next]);
      setPreviews((prev) => [...prev, ...urls]);
    } catch (e) {
      setHint(e instanceof Error ? e.message : "图片处理失败");
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const submit = async () => {
    const msg = message.trim();
    if (!msg) return;
    setSending(true);
    setHint(null);
    const result = await reportClientError({
      source: kind === "feature" ? "manual_feature" : "manual",
      message: msg,
      userNote: note.trim() || undefined,
      images: images.length ? images : undefined,
      metadata: {
        from: "ReportBugButton",
        feedbackKind: kind,
      },
    });
    setSending(false);
    if (result.error && !result.id) {
      setHint(`提交失败：${result.error}`);
      return;
    }
    if (result.error && result.id) {
      setHint(`已提交（${result.error}）`);
    } else {
      setHint("已提交，感谢反馈");
    }
    setTimeout(() => close(), 900);
  };

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-black/40 p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={close}
          >
            <div
              className="my-auto w-full max-w-md rounded-lg border border-fs-border bg-fs-bg p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id={titleId} className="mb-1 text-base font-semibold text-fs-text">
                反馈
              </h2>
              <p className="mb-3 text-xs text-fs-muted">
                可报告使用问题，也可提交产品新需求；可选附带截图。当前页面地址会一并发送。
              </p>

              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setKind("bug")}
                  className={`flex-1 rounded border px-2 py-1.5 text-sm ${
                    kind === "bug"
                      ? "border-fs-accent bg-fs-accent-soft text-fs-accent-text"
                      : "border-fs-border text-fs-muted hover:bg-fs-elevated"
                  }`}
                >
                  报告问题
                </button>
                <button
                  type="button"
                  onClick={() => setKind("feature")}
                  className={`flex-1 rounded border px-2 py-1.5 text-sm ${
                    kind === "feature"
                      ? "border-fs-accent bg-fs-accent-soft text-fs-accent-text"
                      : "border-fs-border text-fs-muted hover:bg-fs-elevated"
                  }`}
                >
                  新需求
                </button>
              </div>

              <label className="mb-1 block text-xs text-fs-muted">
                {kind === "feature" ? "需求简述（必填）" : "问题简述（必填）"}
              </label>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mb-3 w-full rounded border border-fs-border bg-fs-elevated px-3 py-2 text-sm"
                placeholder={
                  kind === "feature"
                    ? "例如：希望宏观图支持导出 PDF"
                    : "例如：宏观图加载失败 / 登录按钮无响应"
                }
                maxLength={500}
              />

              <label className="mb-1 block text-xs text-fs-muted">补充说明（可选）</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="mb-3 w-full rounded border border-fs-border bg-fs-elevated px-3 py-2 text-sm"
                placeholder={
                  kind === "feature"
                    ? "使用场景、期望效果等"
                    : "复现步骤、期望结果等"
                }
                maxLength={2000}
              />

              <label className="mb-1 block text-xs text-fs-muted">
                截图（可选，最多 {MAX_IMAGES} 张）
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                className="mb-2 block w-full text-xs text-fs-muted file:mr-2 file:rounded file:border file:border-fs-border file:bg-fs-elevated file:px-2 file:py-1 file:text-xs"
                onChange={(e) => {
                  void onPickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {previews.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {previews.map((url, i) => (
                    <div
                      key={url}
                      className="relative h-16 w-16 overflow-hidden rounded border border-fs-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute right-0 top-0 bg-black/60 px-1 text-[10px] text-white"
                        aria-label="移除图片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {hint ? <p className="mb-2 text-xs text-fs-muted">{hint}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
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
                  {sending ? "提交中…" : "提交"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-fs-border text-fs-muted transition hover:border-fs-accent/40 hover:bg-fs-elevated hover:text-fs-accent-text"
        title="反馈问题或新需求"
        aria-label="反馈问题或新需求"
      >
        <span className="text-[15px] font-semibold leading-none" aria-hidden>
          ?
        </span>
      </button>
      {dialog}
    </>
  );
}

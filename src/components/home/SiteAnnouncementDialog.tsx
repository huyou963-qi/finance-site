"use client";

import { useEffect, useState } from "react";
import type { ActiveSiteAnnouncement } from "@/lib/siteAnnouncement";

const DISMISSED_PREFIX = "gekko-tech-site-announcement-dismissed";

export function SiteAnnouncementDialog({
  announcement,
  preview = false,
  onClose,
}: {
  announcement: ActiveSiteAnnouncement;
  preview?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(preview);

  useEffect(() => {
    if (preview) {
      setOpen(true);
      return;
    }
    const key = `${DISMISSED_PREFIX}:${announcement.id}:${announcement.revision}`;
    try {
      setOpen(window.localStorage.getItem(key) !== "1");
    } catch {
      setOpen(true);
    }
  }, [announcement.id, announcement.revision, preview]);

  const close = () => {
    if (!preview) {
      const key = `${DISMISSED_PREFIX}:${announcement.id}:${announcement.revision}`;
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        // 本地存储不可用时仍允许正常关闭。
      }
    }
    setOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-announcement-title"
        className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl font-bold text-amber-700"
            aria-hidden
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id="site-announcement-title" className="text-lg font-semibold text-slate-950">
                {announcement.title}
              </h2>
              {preview ? (
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                  预览
                </span>
              ) : null}
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
              {announcement.content}
            </p>
          </div>
        </div>
        <button
          type="button"
          autoFocus
          onClick={close}
          className="mt-6 w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          我知道了
        </button>
      </section>
    </div>
  );
}

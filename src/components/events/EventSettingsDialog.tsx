"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Occasional management controls float above the chart without resizing the event shelf. */
export function EventSettingsDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => { node?.close(); if (trigger instanceof HTMLElement) trigger.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} onClose={onClose} className="fixed inset-0 m-auto max-h-[80dvh] w-[calc(100%-24px)] max-w-2xl overflow-y-auto rounded border border-fs-border bg-fs-bg p-3 text-fs-text shadow-xl backdrop:bg-black/30">
    <div className="mb-3 flex items-center justify-between"><strong className="text-sm">{title}</strong><button className="min-h-10 rounded border border-fs-border px-3 text-xs" onClick={onClose}>关闭</button></div>
    <div className="flex flex-wrap items-center gap-3 text-xs">{children}</div>
  </dialog>;
}

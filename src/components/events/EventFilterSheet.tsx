"use client";

import { useEffect, useRef, useState } from "react";
import { EventPanelFilters } from "./EventPanelFilters";
import type { EventViewFilterState } from "@/lib/chart/eventViewFilters";

/** Mounted per opening: cancelling never writes draft conditions to either source. */
export function EventFilterSheet({ filters, onApply, onClose }: {
  filters: EventViewFilterState;
  onApply: (filters: EventViewFilterState) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="event-filter-sheet-title" onCancel={onClose} onClose={onClose}
    className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none rounded-t-xl border border-fs-border bg-fs-bg p-0 text-fs-text backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:w-[calc(100%-24px)] sm:max-w-2xl sm:rounded-xl">
    <div className="flex max-h-[90dvh] flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-fs-border p-3">
        <h2 id="event-filter-sheet-title" className="text-sm font-semibold">内容筛选</h2>
        <button type="button" className="min-h-10 rounded border border-fs-border px-3 text-sm" onClick={onClose}>取消</button>
      </div>
      <div className="min-h-0 overflow-y-auto p-3"><EventPanelFilters filters={draft} onChange={setDraft} /></div>
      <div className="shrink-0 border-t border-fs-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-xs text-fs-muted">应用后同时更新本类列表和上图候选，另一类事件保持原设置。</p>
        <button type="button" className="min-h-11 w-full rounded bg-fs-accent px-3 text-sm text-white" onClick={() => { onApply(draft); onClose(); }}>应用筛选</button>
      </div>
    </div>
  </dialog>;
}

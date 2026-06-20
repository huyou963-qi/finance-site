"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const POPOVER_MAX_W = 360;
const POPOVER_MAX_H = 320;
const VIEWPORT_PAD = 8;

function popoverStyle(anchor: DOMRect): CSSProperties {
  const spaceBelow = window.innerHeight - anchor.bottom;
  const showAbove =
    spaceBelow < POPOVER_MAX_H + 48 && anchor.top > spaceBelow;

  let left = anchor.left;
  if (left + POPOVER_MAX_W > window.innerWidth - VIEWPORT_PAD) {
    left = window.innerWidth - POPOVER_MAX_W - VIEWPORT_PAD;
  }
  left = Math.max(VIEWPORT_PAD, left);

  if (showAbove) {
    return {
      position: "fixed",
      left,
      bottom: window.innerHeight - anchor.top + 6,
      width: POPOVER_MAX_W,
      maxHeight: Math.min(POPOVER_MAX_H, anchor.top - VIEWPORT_PAD - 6),
      zIndex: 9999,
    };
  }

  return {
    position: "fixed",
    left,
    top: anchor.bottom + 6,
    width: POPOVER_MAX_W,
    maxHeight: Math.min(POPOVER_MAX_H, spaceBelow - VIEWPORT_PAD - 6),
    zIndex: 9999,
  };
}

export type EventContentPopoverProps = {
  anchor: DOMRect | null;
  content: string;
  title?: string | null;
  onDismiss: () => void;
};

export function EventContentPopover({
  anchor,
  content,
  title,
  onDismiss,
}: EventContentPopoverProps) {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(onDismiss, 120);
  };

  useLayoutEffect(() => {
    return () => cancelHide();
  }, []);

  if (!mounted || !anchor || !content.trim()) return null;

  return createPortal(
    <div
      role="tooltip"
      className="overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-[11px] leading-relaxed text-slate-200 shadow-xl ring-1 ring-slate-700/80"
      style={popoverStyle(anchor)}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      {title ? (
        <p className="mb-1.5 border-b border-slate-700/80 pb-1.5 text-xs font-semibold text-slate-100">
          {title}
        </p>
      ) : null}
      <div className="whitespace-pre-wrap break-words text-slate-300">{content}</div>
    </div>,
    document.body,
  );
}

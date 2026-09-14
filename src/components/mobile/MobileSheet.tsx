"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/mobile/mobileIcons";

export type MobileSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** auto：随内容，最高 88% 屏高；tall：固定约 90% 屏高；full：全屏 */
  size?: "auto" | "tall" | "full";
};

/**
 * 手机端底部弹出面板。portal 到 body：顶栏 backdrop-blur 等祖先会形成 fixed 包含块。
 * 只会在用户操作后打开，因此不会参与服务端渲染。
 */
export function MobileSheet({ open, onClose, title, children, footer, size = "auto" }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const panelClass =
    size === "full"
      ? "inset-0"
      : size === "tall"
        ? "inset-x-0 bottom-0 top-[10dvh] rounded-t-2xl"
        : "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl";

  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className={`absolute flex flex-col overflow-hidden bg-fs-bg shadow-2xl ${panelClass}`}
      >
        {size !== "full" ? (
          <div className="mx-auto mb-1 mt-2 h-1 w-9 shrink-0 rounded-full bg-fs-border" aria-hidden />
        ) : null}
        {title ? (
          <div
            className={`flex shrink-0 items-center gap-2 pl-4 pr-1 ${
              size === "full" ? "h-13 border-b border-fs-border" : "pb-1"
            }`}
          >
            <div className="min-w-0 flex-1 truncate text-[17px] font-semibold text-fs-text">{title}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fs-secondary active:bg-fs-elevated"
            >
              <IconClose size={22} />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0 border-t border-fs-border px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useSyncExternalStore } from "react";

/** 手机模式断点：与 Tailwind `md`（768px）对齐，`max-md:` / `md:hidden` 样式与本 hook 同口径 */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * 当前视口是否为手机宽度（< 768px）。服务端与首帧水合一律按桌面渲染，
 * 客户端随后切换，保证桌面端渲染路径不受影响。
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => false,
  );
}

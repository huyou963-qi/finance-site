"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTrackedPath } from "@/lib/analytics/baiduTongji";

type HmtWindow = Window & { _hmt?: { push: (cmd: unknown[]) => unknown } };

/**
 * 单页应用的 PV 上报：每次路由切换给百度统计发一条（首屏也在这里发）。
 * hm.js 可能还没加载完，此时先把命令排进 _hmt 队列，加载后按序执行；
 * 队列若由这里首次创建，先排入关闭自动 PV，避免 hm.js 再自己发一条首屏 PV。
 */
export function BaiduPageView() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    if (!isTrackedPath(pathname)) return;
    const w = window as HmtWindow;
    const queue = (w._hmt ??= [["_setAutoPageview", false]] as unknown[][]);
    queue.push(["_trackPageview", pathname]);
  }, [pathname]);

  return null;
}

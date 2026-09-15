"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";
import {
  isChunkLoadError,
  isLikelyCorruptedScriptSyntaxError,
  reloadStaleAssetOnce,
} from "@/lib/errorReports/chunkReload";

/**
 * 浏览器自身的良性提示，不代表真实 bug：
 * ResizeObserver 回调没能在一帧内跑完时浏览器会报这个，没有 stack/文件信息，无法定位也无需处理。
 * 参见 https://github.com/WICG/resize-observer/issues/38。
 */
function isBenignBrowserNoise(message: string): boolean {
  return /ResizeObserver loop/i.test(message);
}

/**
 * 跨域脚本（第三方统计、浏览器插件注入的脚本等）里抛出的错误，浏览器出于安全考虑会把
 * message 抹成固定的 "Script error."，且没有 filename/lineno/colno/stack，无法定位来源。
 * 这不是本站代码抛出的，报告了也没法排查，属于该过滤掉的噪音。
 */
function isOpaqueCrossOriginError(event: ErrorEvent): boolean {
  return (
    (event.message ?? "").trim().toLowerCase() === "script error." &&
    !event.filename &&
    !event.lineno &&
    !(event.error instanceof Error && event.error.stack)
  );
}

/** 捕获 window.onerror / unhandledrejection，自动上报。 */
export function GlobalErrorListeners() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || "window.onerror";
      if (isBenignBrowserNoise(message) || isOpaqueCrossOriginError(event)) return;
      if (
        (isChunkLoadError(event.error ?? message) || isLikelyCorruptedScriptSyntaxError(event)) &&
        reloadStaleAssetOnce()
      ) {
        return;
      }
      const stack =
        event.error instanceof Error
          ? event.error.stack
          : [event.filename, event.lineno, event.colno].filter(Boolean).join(":");
      void reportClientError({
        source: "auto_window",
        message,
        stack,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (isChunkLoadError(reason) && reloadStaleAssetOnce()) return;
      let message = "unhandledrejection";
      let stack: string | undefined;
      if (reason instanceof Error) {
        message = reason.message || message;
        stack = reason.stack;
      } else if (typeof reason === "string") {
        message = reason;
      } else {
        try {
          message = JSON.stringify(reason);
        } catch {
          message = String(reason);
        }
      }
      void reportClientError({
        source: "auto_window",
        message,
        stack,
        metadata: { kind: "unhandledrejection" },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

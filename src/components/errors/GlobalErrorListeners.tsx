"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";

/** 捕获 window.onerror / unhandledrejection，自动上报。 */
export function GlobalErrorListeners() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || "window.onerror";
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

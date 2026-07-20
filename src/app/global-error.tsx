"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void reportClientError({
      source: "auto_crash",
      message: error.message || "根布局错误",
      stack: error.stack,
      digest: error.digest,
      metadata: { name: error.name, from: "global-error" },
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>出错了</h1>
        <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
          应用根布局发生错误，错误信息已尝试上报。请刷新页面重试。
        </p>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "#888",
            marginBottom: 16,
            wordBreak: "break-all",
          }}
        >
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "8px 14px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}

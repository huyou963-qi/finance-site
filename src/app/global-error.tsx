"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";
import {
  forceReloadStaleAssets,
  isStaleClientAssetError,
  reloadStaleAssetOnce,
} from "@/lib/errorReports/chunkReload";
import { HTML_LANG, splitLocalePath, type AppLocale } from "@/i18n/locales";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";

/** 根布局出错时 next-intl 不可用：按网址前缀直接取文案 */
const ERROR_TEXT: Record<AppLocale, { errors: typeof zh.errors; common: typeof zh.common }> = {
  zh: { errors: zh.errors, common: zh.common },
  en: { errors: { ...zh.errors, ...en.errors }, common: { ...zh.common, ...en.common } },
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleClientAssetError(error);
  const [recovering, setRecovering] = useState(stale);
  // 首次渲染用中文以便与服务端输出一致，挂载后按网址切换
  const [locale, setLocale] = useState<AppLocale>("zh");
  const { errors: t, common: tc } = ERROR_TEXT[locale];

  useEffect(() => {
    setLocale(splitLocalePath(window.location.pathname).locale);
  }, []);

  useEffect(() => {
    if (stale && reloadStaleAssetOnce(error)) {
      setRecovering(true);
      return;
    }
    setRecovering(false);
    void reportClientError({
      source: "auto_crash",
      message: error.message || t.rootError,
      stack: error.stack,
      digest: error.digest,
      metadata: { name: error.name, from: "global-error" },
    });
  }, [error, stale, t.rootError]);

  return (
    <html lang={HTML_LANG[locale]}>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        {stale ? (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>
              {recovering ? t.updatingTitle : t.loadFailedTitle}
            </h1>
            <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
              {recovering ? t.updatingBody : t.loadFailedBody}
            </p>
            {recovering ? null : (
              <button
                type="button"
                onClick={() => forceReloadStaleAssets(error)}
                style={{
                  padding: "8px 14px",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "#f5f5f5",
                  cursor: "pointer",
                }}
              >
                {t.refresh}
              </button>
            )}
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 20, marginBottom: 12 }}>{t.title}</h1>
            <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
              {t.rootBody}
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
              {tc.retry}
            </button>
          </>
        )}
      </body>
    </html>
  );
}

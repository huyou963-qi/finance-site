"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { reportClientError } from "@/lib/errorReports/clientReport";
import {
  forceReloadStaleAssets,
  isStaleClientAssetError,
  reloadStaleAssetOnce,
} from "@/lib/errorReports/chunkReload";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  const stale = isStaleClientAssetError(error);
  const [recovering, setRecovering] = useState(stale);
  const [reportHint, setReportHint] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (stale && reloadStaleAssetOnce(error)) {
      setRecovering(true);
      return;
    }
    setRecovering(false);
    void reportClientError({
      source: "auto_crash",
      message: error.message || t("renderError"),
      stack: error.stack,
      digest: error.digest,
      metadata: { name: error.name },
    });
  }, [error, stale, t]);

  const sendManual = async () => {
    setSending(true);
    setReportHint(null);
    const result = await reportClientError({
      source: "manual",
      message: error.message || t("renderError"),
      stack: error.stack,
      digest: error.digest,
      userNote: note.trim() || undefined,
      metadata: { name: error.name, from: "error.tsx" },
    });
    setSending(false);
    if (result.error) setReportHint(t("reportFailed", { error: result.error }));
    else setReportHint(t("reportSent"));
  };

  if (stale) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-fs-text">
        <h1 className="text-xl font-semibold">{recovering ? t("updatingTitle") : t("loadFailedTitle")}</h1>
        <p className="text-sm text-fs-muted">
          {recovering ? t("updatingBody") : t("loadFailedBody")}
        </p>
        {recovering ? null : (
          <button
            type="button"
            onClick={() => forceReloadStaleAssets(error)}
            className="self-start rounded bg-fs-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            {t("refresh")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-16 text-fs-text">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-fs-muted">{t("body")}</p>
      <p className="rounded border border-fs-border bg-fs-elevated px-3 py-2 font-mono text-xs break-all text-fs-muted">
        {error.message || t("unknown")}
        {error.digest ? " | digest " + error.digest : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-fs-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
        >
          {tc("retry")}
        </button>
        <button
          type="button"
          onClick={() => setShowNote((v) => !v)}
          className="rounded border border-fs-border px-3 py-1.5 text-sm hover:bg-fs-elevated"
        >
          {t("report")}
        </button>
      </div>
      {showNote ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t("notePlaceholder")}
            className="w-full rounded border border-fs-border bg-fs-bg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendManual()}
            className="self-start rounded border border-fs-border px-3 py-1.5 text-sm hover:bg-fs-elevated disabled:opacity-50"
          >
            {sending ? tc("submitting") : t("sendNote")}
          </button>
        </div>
      ) : null}
      {reportHint ? <p className="text-sm text-fs-muted">{reportHint}</p> : null}
    </div>
  );
}

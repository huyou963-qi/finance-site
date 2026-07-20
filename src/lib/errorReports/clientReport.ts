import type { ErrorReportSource } from "@/lib/errorReports/types";

export type ClientErrorReportInput = {
  source: ErrorReportSource;
  message: string;
  stack?: string | null;
  pageUrl?: string;
  userNote?: string;
  digest?: string | null;
  metadata?: Record<string, unknown>;
};

const DEDUPE_PREFIX = "error-report-sent:";

function dedupeKey(input: ClientErrorReportInput): string {
  if (input.digest) return `${DEDUPE_PREFIX}digest:${input.digest}`;
  return `${DEDUPE_PREFIX}${input.source}:${input.message.slice(0, 120)}:${input.pageUrl ?? ""}`;
}

function alreadySent(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/** 浏览器上报错误；同一 digest/指纹本会话只发一次（manual 除外）。 */
export async function reportClientError(
  input: ClientErrorReportInput,
): Promise<{ id?: string; skipped?: boolean; error?: string }> {
  const pageUrl =
    input.pageUrl?.trim() ||
    (typeof window !== "undefined" ? window.location.href : "");
  const message = (input.message || "未知错误").trim().slice(0, 2000);
  if (!pageUrl || !message) return { error: "缺少 pageUrl 或 message" };

  const key = dedupeKey({ ...input, pageUrl, message });
  if (input.source !== "manual" && alreadySent(key)) {
    return { skipped: true };
  }

  try {
    const res = await fetch("/api/error-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: input.source,
        message,
        stack: input.stack ?? undefined,
        pageUrl,
        userNote: input.userNote,
        digest: input.digest ?? undefined,
        metadata: input.metadata,
      }),
      keepalive: true,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    if (!res.ok) {
      return { error: payload.error ?? `HTTP ${res.status}` };
    }
    if (input.source !== "manual") markSent(key);
    return { id: payload.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

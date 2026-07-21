import type { ErrorReportSource } from "@/lib/errorReports/types";

export type ClientReportImage = {
  name: string;
  mime: string;
  dataBase64: string;
};

export type ClientErrorReportInput = {
  source: ErrorReportSource;
  message: string;
  stack?: string | null;
  pageUrl?: string;
  userNote?: string;
  digest?: string | null;
  metadata?: Record<string, unknown>;
  images?: ClientReportImage[];
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

const AUTO_SOURCES = new Set<ErrorReportSource>(["auto_crash", "auto_window"]);

/** 浏览器上报；自动类同一 digest/指纹本会话只发一次。 */
export async function reportClientError(
  input: ClientErrorReportInput,
): Promise<{ id?: string; skipped?: boolean; error?: string }> {
  const pageUrl =
    input.pageUrl?.trim() ||
    (typeof window !== "undefined" ? window.location.href : "");
  const message = (input.message || "未知错误").trim().slice(0, 2000);
  if (!pageUrl || !message) return { error: "缺少 pageUrl 或 message" };

  const key = dedupeKey({ ...input, pageUrl, message });
  if (AUTO_SOURCES.has(input.source) && alreadySent(key)) {
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
        images: input.images,
      }),
      keepalive: !input.images?.length,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    if (!res.ok) {
      return { error: payload.error ?? `HTTP ${res.status}` };
    }
    if (AUTO_SOURCES.has(input.source)) markSent(key);
    return { id: payload.id, error: payload.error };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 将本地 File 读成压缩后的 JPEG base64（过大则缩放到 maxEdge）。 */
export async function fileToReportImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82,
): Promise<ClientReportImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持图片文件");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("无法处理图片");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!m?.[2]) throw new Error("图片编码失败");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "screenshot";
  return {
    name: `${baseName}.jpg`.slice(0, 120),
    mime: "image/jpeg",
    dataBase64: m[2],
  };
}

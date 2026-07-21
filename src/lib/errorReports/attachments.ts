import fs from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  type ErrorReportImageMeta,
} from "@/lib/errorReports/types";

const ATTACH_ROOT = path.join(process.cwd(), ".data", "error-report-attachments");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export type IncomingImage = {
  name: string;
  mime: string;
  /** 纯 base64，不含 data: 前缀 */
  dataBase64: string;
};

function isAllowedMime(mime: string): boolean {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

/** 校验并落盘截图；返回写入 metadata 的图片清单。 */
export async function saveErrorReportImages(
  reportId: string,
  images: IncomingImage[] | undefined,
): Promise<ErrorReportImageMeta[]> {
  if (!images?.length) return [];
  const slice = images.slice(0, MAX_IMAGES);
  const dir = path.join(ATTACH_ROOT, reportId);
  await fs.mkdir(dir, { recursive: true });

  const out: ErrorReportImageMeta[] = [];
  for (let i = 0; i < slice.length; i++) {
    const img = slice[i]!;
    const mime = String(img.mime || "").toLowerCase().trim();
    if (!isAllowedMime(mime)) {
      throw new Error(`不支持的图片类型：${mime || "未知"}`);
    }
    const raw = String(img.dataBase64 || "").replace(/\s/g, "");
    if (!raw) throw new Error("图片数据为空");
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, "base64");
    } catch {
      throw new Error("图片数据无效");
    }
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      throw new Error(`单张图片需 ≤ ${Math.floor(MAX_IMAGE_BYTES / 1000)}KB`);
    }
    const ext = MIME_EXT[mime] ?? ".bin";
    const file = `${i}${ext}`;
    await fs.writeFile(path.join(dir, file), buf);
    const name = String(img.name || file).slice(0, 120);
    out.push({ file, mime, name });
  }
  return out;
}

export function attachmentFilePath(reportId: string, fileName: string): string | null {
  if (!reportId || !fileName) return null;
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  return path.join(ATTACH_ROOT, reportId, fileName);
}

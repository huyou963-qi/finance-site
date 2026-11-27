import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { absoluteUrl } from "@/lib/seo/siteUrl";

const lifetimeMs = 24 * 60 * 60 * 1000;
const cleanupIntervalMs = 10 * 60 * 1000;
const assetName = /^([A-Z0-9.\-]{1,16})~[A-Za-z0-9_-]{43}\.(png|json)$/;
let nextCleanupAt = 0;

function imageDirectory() {
  // The deployment shares .data between releases.
  return join(process.cwd(), ".data", "research-chart-images");
}

async function removeExpiredImages(directory: string, now: number) {
  const files = await readdir(directory, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !assetName.test(file.name)) continue;
    const path = join(directory, file.name);
    try {
      const info = await stat(path);
      if (info.mtimeMs + lifetimeMs <= now) await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function saveArtifact(symbol: string, bytes: Buffer, extension: "png" | "json") {
  const name = `${symbol}~${randomBytes(32).toString("base64url")}.${extension}`;
  if (!assetName.test(name)) throw new Error("Invalid stock chart image name");
  const directory = imageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, name);
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  const now = Date.now();
  const { mtimeMs } = await stat(path);
  if (now >= nextCleanupAt) {
    nextCleanupAt = now + cleanupIntervalMs;
    try {
      await removeExpiredImages(directory, now);
    } catch (error) {
      console.error("[research-mcp] chart image cleanup failed", error);
    }
  }
  return { url: absoluteUrl(`/api/mcp/chart-images/${name}`), expiresAt: new Date(mtimeMs + lifetimeMs).toISOString() };
}

export async function saveStockChartImage(symbol: string, image: Buffer) {
  const { url, expiresAt } = await saveArtifact(symbol, image, "png");
  return {
    imageUrl: url,
    downloadUrl: `${url}?download=1`,
    imageExpiresAt: expiresAt,
    imageFilename: `${symbol}-chart.png`,
  };
}

export async function saveStockEventPack(symbol: string, document: Record<string, unknown>) {
  const { url, expiresAt } = await saveArtifact(symbol, Buffer.from(JSON.stringify(document, null, 2)), "json");
  return { eventPackDownloadUrl: url, eventPackExpiresAt: expiresAt, eventPackFilename: `${symbol}-events.json` };
}

export async function readStockChartArtifact(name: string) {
  const match = assetName.exec(name);
  if (!match || match[0] !== name) return null;
  const path = join(imageDirectory(), name);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.mtimeMs + lifetimeMs <= Date.now()) return null;
    const bytes = await readFile(path);
    return match[2] === "png"
      ? { bytes, filename: `${match[1]}-chart.png`, mimeType: "image/png" }
      : { bytes, filename: `${match[1]}-events.json`, mimeType: "application/json" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

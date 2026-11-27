import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { absoluteUrl } from "@/lib/seo/siteUrl";

const lifetimeMs = 24 * 60 * 60 * 1000;
const cleanupIntervalMs = 10 * 60 * 1000;
const assetName = /^([A-Z0-9.\-]{1,16})~[A-Za-z0-9_-]{43}\.png$/;
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

export async function saveStockChartImage(symbol: string, image: Buffer) {
  const name = `${symbol}~${randomBytes(32).toString("base64url")}.png`;
  if (!assetName.test(name)) throw new Error("Invalid stock chart image name");
  const directory = imageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, name);
  await writeFile(path, image, { flag: "wx", mode: 0o600 });
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
  const imageUrl = absoluteUrl(`/api/mcp/chart-images/${name}`);
  return {
    imageUrl,
    downloadUrl: `${imageUrl}?download=1`,
    imageExpiresAt: new Date(mtimeMs + lifetimeMs).toISOString(),
    imageFilename: `${symbol}-chart.png`,
  };
}

export async function readStockChartImage(name: string) {
  const match = assetName.exec(name);
  if (!match || match[0] !== name) return null;
  const path = join(imageDirectory(), name);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.mtimeMs + lifetimeMs <= Date.now()) return null;
    const bytes = await readFile(path);
    return { bytes, filename: `${match[1]}-chart.png` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

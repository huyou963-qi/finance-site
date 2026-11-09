/**
 * Random-access reader for SEC's bulk XBRL archive (companyfacts.zip, ~1.4 GB, refreshed weekly).
 * https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip
 *
 * Reads the zip central directory once, then decompresses only the companies asked for, so memory
 * stays at one company's JSON at a time. Offline use on the dev machine only — never download or
 * unpack this archive on the 4 GB production server.
 */
import { open, type FileHandle } from "node:fs/promises";
import { inflateSync } from "fflate";

type Entry = { method: number; compressedSize: number; localHeaderOffset: number };

const EOCD = 0x06054b50, ZIP64_LOCATOR = 0x07064b50, ZIP64_EOCD = 0x06064b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
const u64 = (buf: Buffer, at: number) => Number(buf.readBigUInt64LE(at));

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await file.read(buf, 0, length, position);
  if (bytesRead !== length) throw new Error("SEC 归档读取越界，文件可能未下载完整");
  return buf;
}

/** Parse the central directory (zip64-aware). Exported for tests. */
export function parseCentralDirectory(dir: Buffer, count: number): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (dir.readUInt32LE(at) !== CENTRAL) throw new Error("SEC 归档目录格式异常");
    const method = dir.readUInt16LE(at + 10);
    let compressedSize = dir.readUInt32LE(at + 20);
    let uncompressedSize = dir.readUInt32LE(at + 24);
    const nameLen = dir.readUInt16LE(at + 28), extraLen = dir.readUInt16LE(at + 30), commentLen = dir.readUInt16LE(at + 32);
    let localHeaderOffset = dir.readUInt32LE(at + 42);
    const name = dir.toString("utf8", at + 46, at + 46 + nameLen);
    // Zip64 extra field (0x0001) carries, in order, only the values whose 32-bit slot is 0xFFFFFFFF.
    let extra = at + 46 + nameLen;
    const extraEnd = extra + extraLen;
    while (extra + 4 <= extraEnd) {
      const id = dir.readUInt16LE(extra), size = dir.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        let p = extra + 4;
        if (uncompressedSize === 0xffffffff) { uncompressedSize = u64(dir, p); p += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = u64(dir, p); p += 8; }
        if (localHeaderOffset === 0xffffffff) { localHeaderOffset = u64(dir, p); p += 8; }
      }
      extra += 4 + size;
    }
    entries.set(name, { method, compressedSize, localHeaderOffset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export type SecBulkArchive = {
  /** 10-digit zero-padded CIKs present in the archive */
  ciks(): string[];
  has(cik: string): boolean;
  /** Parsed companyfacts JSON, same shape as data.sec.gov/api/xbrl/companyfacts/CIK##########.json */
  read(cik: string): Promise<unknown>;
  close(): Promise<void>;
};

const pad = (cik: string) => cik.replace(/\D/g, "").padStart(10, "0");

export async function openSecBulkArchive(path: string): Promise<SecBulkArchive> {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 65_557);
    const tail = await readAt(file, size - tailLength, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) { eocd = i; break; }
    if (eocd < 0) throw new Error("SEC 归档缺少目录结尾，文件可能未下载完整");
    let count = tail.readUInt16LE(eocd + 10);
    let dirSize = tail.readUInt32LE(eocd + 12);
    let dirOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
      const locator = eocd - 20;
      if (locator < 0 || tail.readUInt32LE(locator) !== ZIP64_LOCATOR) throw new Error("SEC 归档 zip64 定位符缺失");
      const record = await readAt(file, u64(tail, locator + 8), 56);
      if (record.readUInt32LE(0) !== ZIP64_EOCD) throw new Error("SEC 归档 zip64 目录格式异常");
      count = u64(record, 32); dirSize = u64(record, 40); dirOffset = u64(record, 48);
    }
    const entries = parseCentralDirectory(await readAt(file, dirOffset, dirSize), count);
    const byCik = new Map<string, Entry>();
    for (const [name, entry] of entries) {
      const match = /^CIK(\d{10})\.json$/.exec(name);
      if (match) byCik.set(match[1]!, entry);
    }
    return {
      ciks: () => [...byCik.keys()],
      has: cik => byCik.has(pad(cik)),
      async read(cik) {
        const entry = byCik.get(pad(cik));
        if (!entry) throw new Error(`SEC 归档中没有 CIK${pad(cik)}`);
        const header = await readAt(file, entry.localHeaderOffset, 30);
        if (header.readUInt32LE(0) !== LOCAL) throw new Error("SEC 归档条目头异常");
        const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
        const raw = await readAt(file, start, entry.compressedSize);
        const bytes = entry.method === 0 ? raw : entry.method === 8 ? inflateSync(raw) : null;
        if (!bytes) throw new Error(`SEC 归档压缩方式不支持：${entry.method}`);
        return JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf8"));
      },
      close: () => file.close(),
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}

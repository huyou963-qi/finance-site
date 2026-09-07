import fs from "node:fs";
import path from "node:path";
import { deraQuarterUrl } from "./catalog";

/**
 * 下载一个 DERA 季度包。SEC 要求声明可联系的 User-Agent（见其 fair-access 政策），
 * 复用项目既有的 SEC_USER_AGENT 约定。
 *
 * 支持本地缓存目录：季度包一旦发布就不常变，重跑回填时不必反复下载 ~14MB。
 */
export async function fetchDeraQuarterZip(
  quarter: string,
  opts?: { cacheDir?: string; force?: boolean },
): Promise<Buffer> {
  const cachePath = opts?.cacheDir
    ? path.join(opts.cacheDir, `${quarter}_form345.zip`)
    : null;
  if (cachePath && !opts?.force && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  const url = deraQuarterUrl(quarter);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.SEC_USER_AGENT?.trim() || "finance-site dera-insider admin@example.com",
      Accept: "application/zip,*/*",
    },
    signal: AbortSignal.timeout(180_000),
  });
  if (res.status === 404) {
    // 当季通常尚未发布——这是正常状态，调用方据此停止而不是报错
    throw new DeraQuarterNotPublished(quarter);
  }
  if (!res.ok) {
    throw new Error(`DERA ${quarter} 下载 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000) {
    throw new Error(`DERA ${quarter} 下载体积异常（${buf.length} 字节），疑似错误页`);
  }
  if (cachePath) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, buf);
  }
  return buf;
}

export class DeraQuarterNotPublished extends Error {
  constructor(public readonly quarter: string) {
    super(`DERA ${quarter} 尚未发布（404）`);
    this.name = "DeraQuarterNotPublished";
  }
}

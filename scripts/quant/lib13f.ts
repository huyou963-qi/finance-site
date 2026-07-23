/**
 * SEC Form 13F 数据集下载/解压/解析共享件（Phase 5 WS1+WS2 脚本侧）。
 * 依赖系统 `unzip`（本机 git-bash 自带）；仅供 ops 脚本，不进 app 运行时。
 */
import { spawn } from "node:child_process";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { parseSecDate } from "../../src/lib/quant/thirteenF";

const SEC_UA =
  process.env.SEC_USER_AGENT?.trim() || "hblook.com equity-funding admin@hblook.com";
const INDEX_URL =
  "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets";

export type Dataset = {
  /** 候选 zip URL（按序尝试：SEC 命名分「日期区间」与「日历季度」两代，逐个试到 200） */
  urls: string[];
  /** 文件名（缓存文件名，如 2024q4 或 01dec2024-28feb2025） */
  name: string;
  /** 该季度结束日 ISO（用于排序/筛选） */
  endIso: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** SEC 偶发 503/超时 → 指数退避重试 */
async function fetchRetry(
  url: string,
  init: RequestInit,
  attempts = 7,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        lastErr = new Error(`HTTP ${res.status}`);
        if (Number.isFinite(ra) && ra > 0) await sleep(ra * 1000);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;
    }
    // SEC 公平访问节流：指数退避 + 抖动（3s,6s,12s,24s,48s,60s…）
    await sleep(Math.min(60_000, 3000 * 2 ** i) + Math.floor(Math.random() * 1000));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const MON: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** 从文件名尾段 "…-28feb2025_form13f.zip" 解析窗口结束日 */
function endIsoFromName(name: string): string | null {
  const m = /-(\d{1,2})([a-z]{3})(\d{4})_form13f\.zip$/i.exec(name);
  if (!m) return null;
  const mm = MON[m[2]!.toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1]!.padStart(2, "0")}`;
}

const BASE = "https://www.sec.gov/files/structureddata/data/form-13f-data-sets";

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * 按已知命名规律确定性生成季度数据集（免抓易 503 的索引页）。
 * SEC 两代命名：
 *   - 新（约 2024+）：日期区间 `01mmm(Y-1或Y)-ddmmm(Y)_form13f.zip`（filing 窗口，偏移一月）；
 *   - 旧：日历季度 `YYYYqN_form13f.zip`。
 * 每个日历季度给两代候选 URL，下载时逐个试到 200；不存在者 404 被跳过。
 * startYear 默认 2013（结构化数据集下限）。
 */
export function generateDatasets(startYear = 2013): Dataset[] {
  const nowIso = new Date().toISOString().slice(0, 10);
  // SEC 结构化 13F 数据集实际起点 = 2013Q2（2013Q1 及更早在 SEC 侧 404，已实测确认）。
  // 设下限避免对不存在的季度发起请求、并把 404 误报成"失败季度"。
  const EARLIEST_END = "2013-06-30";
  const endYear = new Date().getUTCFullYear() + 1;
  const qEnd = ["03-31", "06-30", "09-30", "12-31"];
  // 与季度对齐的「日期区间」命名（近代）：Q1→01dec(Y-1)-feb(Y) 等
  const rangeName = (y: number, q: number): string => {
    const feb = isLeap(y) ? 29 : 28;
    if (q === 1) return `01dec${y - 1}-${feb}feb${y}_form13f.zip`;
    if (q === 2) return `01mar${y}-31may${y}_form13f.zip`;
    if (q === 3) return `01jun${y}-31aug${y}_form13f.zip`;
    return `01sep${y}-30nov${y}_form13f.zip`;
  };
  const out: Dataset[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let q = 1; q <= 4; q++) {
      const endIso = `${y}-${qEnd[q - 1]}`;
      if (endIso > nowIso) continue;
      if (endIso < EARLIEST_END) continue; // 2013Q2 之前 SEC 无数据集
      out.push({
        name: `${y}q${q}`,
        endIso,
        urls: [
          `${BASE}/${y}q${q}_form13f.zip`, // 旧：日历季度
          `${BASE}/${rangeName(y, q)}`, // 新：日期区间
        ],
      });
    }
  }
  out.sort((a, b) => a.endIso.localeCompare(b.endIso));
  return out;
}

/**
 * 数据集清单：优先抓索引页（权威）；索引页 503/失败则退回确定性生成（URL 规律稳定，
 * 不存在的窗口在下载阶段 404 被 per-zip try/catch 跳过）。
 */
export async function listDatasets(): Promise<Dataset[]> {
  // 以确定性生成的完整列表为准（2013→今，每季两种命名候选）。
  // 不能只靠索引页：它在部分网络/时段只列出最近约 10 个季度，会让 --from=2013-01 静默只回填近两年。
  const out = generateDatasets();
  const known = new Set<string>();
  for (const d of out) for (const u of d.urls) known.add(u.split("/").pop()!.toLowerCase());

  // 索引页作为补充：捞出生成规律没覆盖到的异常命名
  try {
    const res = await fetchRetry(
      INDEX_URL,
      { headers: { "User-Agent": SEC_UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) },
      3,
    );
    if (res.ok) {
      const html = await res.text();
      const hrefs = [...html.matchAll(/href="([^"]*form13f[^"]*\.zip)"/gi)].map((m) => m[1]!);
      let extra = 0;
      for (const href of hrefs) {
        const url = href.startsWith("http") ? href : `https://www.sec.gov${href}`;
        const fname = url.split("/").pop()!;
        if (known.has(fname.toLowerCase())) continue; // 已被生成候选覆盖
        const endIso = endIsoFromName(fname);
        if (!endIso) continue;
        known.add(fname.toLowerCase());
        out.push({ urls: [url], name: fname.replace(/_form13f\.zip$/i, ""), endIso });
        extra++;
      }
      if (extra) console.log(`索引页补充 ${extra} 个非常规命名数据集`);
    }
  } catch (e) {
    console.warn(`索引页不可用（${e instanceof Error ? e.message : e}）——使用生成列表`);
  }

  out.sort((a, b) => a.endIso.localeCompare(b.endIso));
  return out;
}

/**
 * 轻量校验：读文件尾部找 ZIP End-Of-Central-Directory 签名（PK\x05\x06）。
 * 不稳定链路（跨境访问 SEC）可能让流悄悄提前结束而不报错——被截断的下载
 * 仍会 "resolve" 成功但文件不完整；EOCD 签名缺失能兜底识别出这类损坏文件，
 * 避免被当作有效缓存反复复用（unzip 报 "End-of-central-directory signature not found" 即此症状）。
 */
function looksLikeValidZip(path: string): boolean {
  try {
    const size = statSync(path).size;
    if (size < 22) return false;
    const readLen = Math.min(size, 65_557); // EOCD 定长 22 + 最大注释 65535
    const buf = Buffer.alloc(readLen);
    const fd = openSync(path, "r");
    readSync(fd, buf, 0, readLen, size - readLen);
    closeSync(fd);
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 下载 zip 到本地。逐个试候选 URL，流式写盘避免 86MB 全缓冲超时；
 * 用 Content-Length 字节数比对 + ZIP 尾部签名双重校验下载完整性——截断文件
 * 视为失败并删除，不会被当作"已下载"缓存复用（见 looksLikeValidZip 注释）。
 */
export async function downloadZip(ds: Dataset, cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const dest = join(cacheDir, `${ds.name}_form13f.zip`);
  if (existsSync(dest) && statSync(dest).size > 1_000_000 && looksLikeValidZip(dest)) {
    return dest;
  }
  if (existsSync(dest)) {
    // 缓存文件存在但校验不过（如上次下载被截断）——删掉重下，不能信任
    try {
      rmSync(dest);
    } catch {
      /* ignore */
    }
  }
  await sleep(3000); // SEC 公平访问：批量下载间隔（避免突发触发 503 节流）
  let last = "";
  for (const url of ds.urls) {
    let res: Response;
    try {
      res = await fetchRetry(url, { headers: { "User-Agent": SEC_UA } });
    } catch (e) {
      last = `${e instanceof Error ? e.message : e} ${url}`;
      continue;
    }
    if (res.status === 404) {
      last = `404 ${url}`;
      continue; // 该命名不存在，试下一候选
    }
    if (!res.ok || !res.body) {
      last = `HTTP ${res.status} ${url}`;
      continue;
    }
    const expectedLength = Number(res.headers.get("content-length"));
    try {
      await new Promise<void>((resolve, reject) => {
        const src = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
        const ws = createWriteStream(dest);
        let received = 0;
        // 停滞检测：> 120s 无数据则中断（区别于慢但持续的下载）
        let timer: NodeJS.Timeout;
        const bump = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            src.destroy(new Error("下载停滞超时"));
          }, 120_000);
        };
        src.on("data", (chunk: Buffer) => {
          received += chunk.length;
          bump();
        });
        src.on("error", (e) => {
          clearTimeout(timer);
          ws.destroy();
          reject(e);
        });
        ws.on("error", (e) => {
          clearTimeout(timer);
          src.destroy();
          reject(e);
        });
        ws.on("finish", () => {
          clearTimeout(timer);
          // 不稳定链路会出现流悄悄提前结束（无 error 事件）——用长度比对兜底识别截断
          if (Number.isFinite(expectedLength) && expectedLength > 0 && received !== expectedLength) {
            reject(new Error(`下载不完整：收到 ${received} / 期望 ${expectedLength} 字节`));
            return;
          }
          resolve();
        });
        bump();
        src.pipe(ws);
      });
      if (!looksLikeValidZip(dest)) {
        throw new Error("下载完成但 ZIP 签名校验失败（可能截断）");
      }
      return dest;
    } catch (e) {
      last = `${e instanceof Error ? e.message : e} ${url}`;
      try {
        rmSync(dest);
      } catch {
        /* ignore 半成品 */
      }
      continue;
    }
  }
  throw new Error(`下载 ${ds.name} 全部候选失败（${last}）`);
}

/**
 * 解压指定条目到目录（覆盖），返回解出的文件路径。依赖系统 `unzip`（Linux 部署需 apt-get install -y unzip）。
 * 用通配符 `*<entry>` + `-j`（去路径）匹配：SEC 部分季度的 zip 把内容多包了一层目录
 * （如 `01JUN2025-31AUG2025_form13f/SUBMISSION.tsv`），写死条目名会 "filename not matched"（退出码 11）。
 */
export function extractEntry(zipPath: string, entry: string, destDir: string): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-o", "-q", "-j", zipPath, `*${entry}`, "-d", destDir]);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      // 常见于全新 Linux 服务器未装 unzip
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "找不到 `unzip` 命令——13F 解压依赖系统 unzip。请先安装：Debian/Ubuntu `apt-get install -y unzip`（或 CentOS `yum install -y unzip`）。",
          ),
        );
      } else {
        reject(e);
      }
    });
    p.on("close", (code) => {
      if (code === 0) resolve(join(destDir, entry));
      else reject(new Error(`unzip ${entry} 退出码 ${code}: ${err}`));
    });
  });
}

/** 读整个 TSV 到行数组（小文件用：SUBMISSION/COVERPAGE） */
export async function readTsvLines(path: string): Promise<string[]> {
  const lines: string[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) lines.push(line);
  return lines;
}

/** 逐行流式回调（大文件用：INFOTABLE） */
export async function streamTsv(
  path: string,
  onLine: (line: string, lineNo: number) => void | Promise<void>,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let n = 0;
  // 支持异步回调（如摄入时按批 flush 写库以控内存）；同步回调返回 void，await 无副作用
  for await (const line of rl) await onLine(line, n++);
}

/**
 * 直接从 zip 流式读取某条目（`unzip -p` 管道到 readline），**不落 346MB 临时文件到磁盘**。
 * 关键收益：低内存/小盘机器（/tmp 常为 tmpfs 会吃 RAM）避免 350MB 临时文件占用。逐行 await 回调，
 * 回调可异步（边扫边分批写库控内存）。
 */
export async function streamZipEntry(
  zipPath: string,
  entry: string,
  onLine: (line: string, lineNo: number) => void | Promise<void>,
): Promise<void> {
  // 通配符匹配：兼容部分季度 zip 多包一层目录的情况（见 extractEntry 注释）
  const p = spawn("unzip", ["-p", zipPath, `*${entry}`]);
  let err = "";
  p.stderr.on("data", (d) => (err += d.toString()));
  const exitPromise = new Promise<number>((resolve, reject) => {
    p.on("error", (e) => {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("找不到 `unzip` 命令——请先安装：Debian/Ubuntu `apt-get install -y unzip`。"));
      } else {
        reject(e);
      }
    });
    p.on("close", (code) => resolve(code ?? -1));
  });
  // stdout 报错时让 for-await 抛出，交由调用方 try/catch
  const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) await onLine(line, n++); // 全量排空 stdout（含每次 flush 的 await）后才结束
  const code = await exitPromise;
  if (code !== 0) throw new Error(`unzip -p ${entry} 退出码 ${code}: ${err}`);
}

export type SubmissionMeta = {
  accession: string;
  filedIso: string;
  submissionType: string;
  cik: string;
  periodIso: string;
};

/** 解析 SUBMISSION.tsv → accession 元数据（仅 13F-HR / 13F-HR/A 保留 INFOTABLE） */
export async function parseSubmissions(path: string): Promise<Map<string, SubmissionMeta>> {
  const lines = await readTsvLines(path);
  const out = new Map<string, SubmissionMeta>();
  if (!lines.length) return out;
  const idx = new Map<string, number>();
  lines[0]!.split("\t").forEach((c, i) => idx.set(c.trim().toUpperCase(), i));
  const gi = (cols: string[], k: string) => cols[idx.get(k) ?? -1] ?? "";
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    const accession = gi(cols, "ACCESSION_NUMBER").trim();
    if (!accession) continue;
    const submissionType = gi(cols, "SUBMISSIONTYPE").trim();
    const filedIso = parseSecDate(gi(cols, "FILING_DATE"));
    const periodIso = parseSecDate(gi(cols, "PERIODOFREPORT"));
    if (!filedIso || !periodIso) continue;
    out.set(accession, {
      accession,
      filedIso,
      submissionType,
      cik: gi(cols, "CIK").trim(),
      periodIso,
    });
  }
  return out;
}

/** 解析 COVERPAGE.tsv → accession → {filerName, isAmendment} */
export async function parseCoverpages(
  path: string,
): Promise<Map<string, { filerName: string; isAmendment: boolean }>> {
  const lines = await readTsvLines(path);
  const out = new Map<string, { filerName: string; isAmendment: boolean }>();
  if (!lines.length) return out;
  const idx = new Map<string, number>();
  lines[0]!.split("\t").forEach((c, i) => idx.set(c.trim().toUpperCase(), i));
  const gi = (cols: string[], k: string) => cols[idx.get(k) ?? -1] ?? "";
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t");
    const accession = gi(cols, "ACCESSION_NUMBER").trim();
    if (!accession) continue;
    out.set(accession, {
      filerName: gi(cols, "FILINGMANAGER_NAME").trim().slice(0, 256),
      isAmendment: gi(cols, "ISAMENDMENT").trim().toUpperCase() === "Y",
    });
  }
  return out;
}

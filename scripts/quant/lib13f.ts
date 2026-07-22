/**
 * SEC Form 13F 数据集下载/解压/解析共享件（Phase 5 WS1+WS2 脚本侧）。
 * 依赖系统 `unzip`（本机 git-bash 自带）；仅供 ops 脚本，不进 app 运行时。
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
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
  try {
    const res = await fetchRetry(
      INDEX_URL,
      { headers: { "User-Agent": SEC_UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) },
      3,
    );
    if (!res.ok) throw new Error(`索引页 HTTP ${res.status}`);
    const html = await res.text();
    const hrefs = [...html.matchAll(/href="([^"]*form13f[^"]*\.zip)"/gi)].map((m) => m[1]!);
    const seen = new Set<string>();
    const out: Dataset[] = [];
    for (const href of hrefs) {
      const url = href.startsWith("http") ? href : `https://www.sec.gov${href}`;
      const fname = url.split("/").pop()!;
      if (seen.has(fname)) continue;
      seen.add(fname);
      const endIso = endIsoFromName(fname);
      if (!endIso) continue;
      out.push({ urls: [url], name: fname.replace(/_form13f\.zip$/i, ""), endIso });
    }
    if (out.length) {
      out.sort((a, b) => a.endIso.localeCompare(b.endIso));
      return out;
    }
    throw new Error("索引页无 zip 链接");
  } catch (e) {
    console.warn(`索引页不可用（${e instanceof Error ? e.message : e}）→ 确定性生成 URL`);
    return generateDatasets();
  }
}

/** 下载 zip 到本地（已存在且非空则跳过）。逐个试候选 URL，流式写盘避免 86MB 全缓冲超时。 */
export async function downloadZip(ds: Dataset, cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const dest = join(cacheDir, `${ds.name}_form13f.zip`);
  if (existsSync(dest) && statSync(dest).size > 1_000_000) return dest;
  await sleep(3000); // SEC 公平访问：批量下载间隔（避免突发触发 503 节流）
  let last = "";
  for (const url of ds.urls) {
    // 停滞超时：整体 30 分钟上限（慢链路 86MB），不用 AbortSignal 硬砍以免流中途报错
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
    try {
      await new Promise<void>((resolve, reject) => {
        const src = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
        const ws = createWriteStream(dest);
        // 停滞检测：> STALL_MS 无数据则中断（区别于慢但持续的下载）
        let timer: NodeJS.Timeout;
        const bump = () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            src.destroy(new Error("下载停滞超时"));
          }, 120_000);
        };
        src.on("data", bump);
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
          resolve();
        });
        bump();
        src.pipe(ws);
      });
      return dest;
    } catch (e) {
      last = `流错误 ${e instanceof Error ? e.message : e} ${url}`;
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

/** 解压指定条目到目录（覆盖），返回解出的文件路径 */
export function extractEntry(zipPath: string, entry: string, destDir: string): Promise<string> {
  mkdirSync(destDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-o", "-q", zipPath, entry, "-d", destDir]);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
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
  onLine: (line: string, lineNo: number) => void,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) onLine(line, n++);
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

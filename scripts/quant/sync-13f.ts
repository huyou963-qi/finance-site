/**
 * 13F 机构持仓摄入（Phase 5 WS2）。
 *
 * 对每个季度数据集：解析 SUBMISSION/COVERPAGE，流式扫 INFOTABLE 只留宇宙 CUSIP（桥接命中），
 * 按 (accession, cusip) 聚合（同一 filing 内多披露口径分行求和），value 按 filedAt 归一到美元，
 * 落 mds.institutional_holding。PIT 可见日 = filedAt。
 *
 * Usage:
 *   npm run quant:sync-13f -- --from=2020-06            # 摄入窗口结束日 ≥ 2020-06 的所有季度
 *   npm run quant:sync-13f -- --datasets=8              # 最近 8 个季度
 *   npm run quant:sync-13f -- --zip=/path/a.zip         # 本地缓存 zip（可重复）
 *   npm run quant:sync-13f -- --from=2013-01 --keep-zip # 全量回填并保留 zip 缓存
 *   npm run quant:sync-13f -- --from=2013-01 --to=2015-12  # 分批回填（小内存机器推荐，逐段跑）
 *
 * 小内存(2GB)机器建议：分批 `--from/--to`（每批 ~8 季）、回填期间停掉网站、
 * 用磁盘目录而非 tmpfs 的 FUNDING_CACHE_DIR、并加 NODE_OPTIONS=--max-old-space-size=512 兜底。
 */
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import {
  splitTsv,
  headerIndex,
  parseInfoTableRow,
  scaleValueToUsd,
} from "../../src/lib/quant/thirteenF";
import {
  listDatasets,
  downloadZip,
  extractEntry,
  streamZipEntry,
  parseSubmissions,
  parseCoverpages,
  type Dataset,
} from "./lib13f";

const CACHE_DIR = process.env.FUNDING_CACHE_DIR || join(tmpdir(), "funding-13f");
/** 单条 INSERT 的行数。小内存机器可用 FUNDING_INSERT_CHUNK 调小（每批语句更小、索引维护峰值更低） */
const INSERT_CHUNK = Math.max(200, Number(process.env.FUNDING_INSERT_CHUNK) || 2000);
/** 每季之间的停顿（毫秒），给 Postgres 刷脏页/回收内存的喘息时间；小内存机器建议 3000+ */
const QUARTER_PAUSE_MS = Math.max(0, Number(process.env.FUNDING_QUARTER_PAUSE_MS) || 0);
/** 只处理有 INFOTABLE 的报告型 */
const HOLDINGS_TYPES = new Set(["13F-HR", "13F-HR/A"]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function argValue(name: string): string | undefined {
  const kv = process.argv.find((a) => a.startsWith(`${name}=`));
  return kv ? kv.slice(name.length + 1) : undefined;
}
function argValues(name: string): string[] {
  return process.argv.filter((a) => a.startsWith(`${name}=`)).map((a) => a.slice(name.length + 1));
}
function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

type HoldingRow = {
  cusip: string;
  symbol: string | null;
  filerCik: string;
  filerName: string | null;
  periodEnd: string;
  filedAt: string;
  submissionType: string;
  isAmendment: boolean;
  shares: number;
  value: number;
  accession: string;
};

async function upsertHoldings(rows: HoldingRow[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const values = chunk.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${r.cusip}, ${r.symbol}, ${r.filerCik}, ${r.filerName}, ${new Date(`${r.periodEnd}T00:00:00.000Z`)}::date, ${new Date(`${r.filedAt}T00:00:00.000Z`)}::date, ${r.submissionType}, ${r.isAmendment}, ${r.shares}, ${r.value}, ${r.accession}, CURRENT_TIMESTAMP)`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "mds"."institutional_holding"
        ("id","cusip","symbol","filer_cik","filer_name","period_end","filed_at","submission_type","is_amendment","shares","value","accession","updated_at")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("accession","cusip") DO UPDATE SET
        "symbol" = EXCLUDED."symbol",
        "shares" = EXCLUDED."shares",
        "value" = EXCLUDED."value",
        "filed_at" = EXCLUDED."filed_at",
        "period_end" = EXCLUDED."period_end",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }
  return written;
}

/** 处理单个 zip：解析并落库，返回写入行数 */
async function ingestZip(
  zipPath: string,
  cusipToSymbol: Map<string, string>,
): Promise<number> {
  const subPath = await extractEntry(zipPath, "SUBMISSION.tsv", CACHE_DIR);
  const covPath = await extractEntry(zipPath, "COVERPAGE.tsv", CACHE_DIR);
  const submissions = await parseSubmissions(subPath);
  const coverpages = await parseCoverpages(covPath);
  console.log(`    SUBMISSION ${submissions.size} 份 / COVERPAGE ${coverpages.size} 份，解压 INFOTABLE（约 350MB，慢盘可能需数分钟）…`);

  // 流式扫 INFOTABLE：按 filing（accession）边界聚合后立即入 pending，满 FLUSH_ROWS 就写库。
  // SEC INFOTABLE 按 accession 连续排列（同一 filing 的持仓相邻），故按边界聚合结果与全量聚合一致，
  // 且每 (accession,cusip) 只写一次、幂等可续跑。内存峰值 = 单 filing + 一批 pending（~几 MB），
  // 而非整季 70 万条全量聚合（数百 MB）——2GB 小内存机器由此可稳跑。
  console.log(`    直接从 zip 流式读 INFOTABLE（不落临时文件）…`);
  const FLUSH_ROWS = 20_000;
  let idx: Map<string, number> | null = null;
  let scanned = 0;
  let kept = 0;
  let written = 0;
  let curAcc: string | null = null;
  let accMap = new Map<string, { shares: number; value: number }>(); // 当前 filing 内 cusip→聚合
  let pending: HoldingRow[] = [];
  const finalizedAcc = new Set<string>(); // 越界重现检测（防非连续排列的静默丢数）
  let outOfOrderWarned = false;

  const finalizeCurrentAcc = () => {
    if (!curAcc || accMap.size === 0) {
      accMap = new Map();
      return;
    }
    const meta = submissions.get(curAcc);
    if (meta) {
      const cov = coverpages.get(curAcc);
      for (const [cusip, e] of accMap) {
        pending.push({
          cusip,
          symbol: cusipToSymbol.get(cusip) ?? null,
          filerCik: meta.cik,
          filerName: cov?.filerName ?? null,
          periodEnd: meta.periodIso,
          filedAt: meta.filedIso,
          submissionType: meta.submissionType,
          isAmendment: cov?.isAmendment ?? meta.submissionType.endsWith("/A"),
          shares: e.shares,
          value: scaleValueToUsd(e.value, meta.filedIso),
          accession: curAcc,
        });
      }
    }
    finalizedAcc.add(curAcc);
    accMap = new Map();
  };

  await streamZipEntry(zipPath, "INFOTABLE.tsv", async (line, n) => {
    if (n === 0) {
      idx = headerIndex(line);
      return;
    }
    scanned++;
    if (scanned % 1_000_000 === 0) {
      console.log(`      …已扫 ${(scanned / 1e6).toFixed(0)}M 行，留宇宙 ${kept}，已写 ${written}`);
    }
    const row = parseInfoTableRow(splitTsv(line), idx!);
    if (!row) return;
    if (!cusipToSymbol.has(row.cusip)) return; // 只留宇宙 CUSIP
    const meta = submissions.get(row.accession);
    if (!meta || !HOLDINGS_TYPES.has(meta.submissionType)) return;

    // filing 边界 → 结算上一 filing，满批则 flush 写库
    if (row.accession !== curAcc) {
      finalizeCurrentAcc();
      if (pending.length >= FLUSH_ROWS) {
        written += await upsertHoldings(pending);
        pending = [];
      }
      if (finalizedAcc.has(row.accession) && !outOfOrderWarned) {
        console.warn(`      ⚠ INFOTABLE 非按 accession 连续排列（${row.accession} 重现）——该 filing 部分持仓可能被覆盖而非累加`);
        outOfOrderWarned = true;
      }
      curAcc = row.accession;
    }
    kept++;
    const e = accMap.get(row.cusip);
    if (!e) accMap.set(row.cusip, { shares: row.shares, value: row.value });
    else {
      e.shares += row.shares;
      e.value += row.value;
    }
  });
  finalizeCurrentAcc();
  if (pending.length) written += await upsertHoldings(pending);
  console.log(`    INFOTABLE 扫 ${scanned} 行，留宇宙 ${kept}，写库 ${written}`);
  // 清理解出的小临时文件（INFOTABLE 走管道未落盘；zip 保留与否由 --keep-zip 控制）
  for (const p of [subPath, covPath]) {
    try {
      rmSync(p);
    } catch {
      /* ignore */
    }
  }
  return written;
}

async function main() {
  const t0 = Date.now();
  const localZips = argValues("--zip");
  const from = argValue("--from"); // YYYY-MM
  const to = argValue("--to"); // YYYY-MM（含）——小内存机器分批回填用
  const nDatasets = argValue("--datasets") ? Number(argValue("--datasets")) : undefined;
  const keepZip = argFlag("--keep-zip");

  // CUSIP→symbol 桥
  const secs = await prisma.equitySecurity.findMany({
    where: { cusip: { not: null } },
    select: { symbol: true, cusip: true },
  });
  const cusipToSymbol = new Map<string, string>();
  for (const s of secs) if (s.cusip) cusipToSymbol.set(s.cusip.toUpperCase(), s.symbol);
  console.log(`桥接 CUSIP ${cusipToSymbol.size} 个（EquitySecurity.cusip 已回填）`);
  if (!cusipToSymbol.size) throw new Error("无 CUSIP 桥，先跑 quant:build-cusip-bridge");

  let total = 0;
  let failed = 0;

  // 本地缓存 zip 路径直接摄入
  if (localZips.length) {
    for (const zp of localZips) {
      console.log(`  摄入 ${zp} …`);
      try {
        total += await ingestZip(zp, cusipToSymbol);
      } catch (e) {
        failed++;
        console.warn(`  ✗ 跳过 ${zp}：`, e instanceof Error ? e.message : e);
      }
    }
  } else {
    const all = await listDatasets();
    let picked: Dataset[] = all;
    if (from) picked = picked.filter((d) => d.endIso.slice(0, 7) >= from);
    if (to) picked = picked.filter((d) => d.endIso.slice(0, 7) <= to);
    if (nDatasets) picked = picked.slice(-nDatasets);
    if (!picked.length) throw new Error("无匹配数据集（检查 --from/--to/--datasets）");
    console.log(`目标 ${picked.length} 个季度：${picked[0]!.name} … ${picked[picked.length - 1]!.name}`);
    // 逐季度：下载→摄入→清理，单季失败（404/超时）跳过不中断全程
    for (const ds of picked) {
      let zp: string | null = null;
      try {
        console.log(`  下载/缓存 ${ds.name}（止 ${ds.endIso}）…`);
        zp = await downloadZip(ds, CACHE_DIR);
        console.log(`  摄入 ${ds.name} …`);
        total += await ingestZip(zp, cusipToSymbol);
      } catch (e) {
        failed++;
        console.warn(`  ✗ 跳过 ${ds.name}：`, e instanceof Error ? e.message : e);
      } finally {
        if (zp && !keepZip) {
          try {
            rmSync(zp);
          } catch {
            /* ignore */
          }
        }
      }
      // 小内存机器：报告本进程常驻内存 + 季间停顿，便于发现内存爬升并给 PG 喘息
      const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
      console.log(`    [${ds.name} 完成] 本进程 RSS ${rssMb}MB，累计写库 ${total} 行`);
      if (QUARTER_PAUSE_MS > 0) await sleep(QUARTER_PAUSE_MS);
    }
  }

  console.log(
    `\n完成：写库 ${total} 行，失败 ${failed} 个季度，耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

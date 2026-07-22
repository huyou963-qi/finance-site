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
 */
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
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
  streamTsv,
  parseSubmissions,
  parseCoverpages,
  type Dataset,
} from "./lib13f";

const CACHE_DIR =
  process.env.FUNDING_CACHE_DIR ||
  "C:/Users/ADMINI~1/AppData/Local/Temp/claude/funding-13f";
const INSERT_CHUNK = 2000;
/** 只处理有 INFOTABLE 的报告型 */
const HOLDINGS_TYPES = new Set(["13F-HR", "13F-HR/A"]);

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

  // 流式扫 INFOTABLE，聚合 (accession|cusip) → {shares,value}
  const infoPath = await extractEntry(zipPath, "INFOTABLE.tsv", CACHE_DIR);
  const agg = new Map<string, { accession: string; cusip: string; shares: number; value: number }>();
  let idx: Map<string, number> | null = null;
  let scanned = 0;
  let kept = 0;
  await streamTsv(infoPath, (line, n) => {
    if (n === 0) {
      idx = headerIndex(line);
      return;
    }
    scanned++;
    const row = parseInfoTableRow(splitTsv(line), idx!);
    if (!row) return;
    if (!cusipToSymbol.has(row.cusip)) return; // 只留宇宙 CUSIP
    const meta = submissions.get(row.accession);
    if (!meta || !HOLDINGS_TYPES.has(meta.submissionType)) return;
    kept++;
    const key = `${row.accession}|${row.cusip}`;
    let e = agg.get(key);
    if (!e) {
      e = { accession: row.accession, cusip: row.cusip, shares: 0, value: 0 };
      agg.set(key, e);
    }
    e.shares += row.shares;
    e.value += row.value;
  });

  // 组装落库行
  const out: HoldingRow[] = [];
  for (const e of agg.values()) {
    const meta = submissions.get(e.accession)!;
    const cov = coverpages.get(e.accession);
    out.push({
      cusip: e.cusip,
      symbol: cusipToSymbol.get(e.cusip) ?? null,
      filerCik: meta.cik,
      filerName: cov?.filerName ?? null,
      periodEnd: meta.periodIso,
      filedAt: meta.filedIso,
      submissionType: meta.submissionType,
      isAmendment: cov?.isAmendment ?? meta.submissionType.endsWith("/A"),
      shares: e.shares,
      value: scaleValueToUsd(e.value, meta.filedIso),
      accession: e.accession,
    });
  }
  const written = await upsertHoldings(out);
  console.log(
    `    INFOTABLE 扫 ${scanned} 行，留宇宙 ${kept}，聚合 ${agg.size} 持仓行，写库 ${written}`,
  );
  // 清理解出的大文件（zip 保留与否由 --keep-zip 控制）
  for (const p of [subPath, covPath, infoPath]) {
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
    if (nDatasets) picked = picked.slice(-nDatasets);
    if (!picked.length) throw new Error("无匹配数据集（检查 --from/--datasets）");
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

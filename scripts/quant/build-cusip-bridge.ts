/**
 * CUSIP↔symbol 桥构建（Phase 5 WS1）。
 *
 * 从一个或多个 13F 数据集 INFOTABLE 抽取 distinct（CUSIP, NAMEOFISSUER, TITLEOFCLASS, filer 数），
 * 与现宇宙（IndexConstituent SP500 ∪ EquitySecurity 名）模糊匹配 + 类别消歧 → 回填
 * EquitySecurity.cusip，产出覆盖率报表。头号可行性风险，接受部分覆盖 + 透明化。
 *
 * Usage:
 *   npm run quant:build-cusip-bridge                    # 下载最近 1 个数据集
 *   npm run quant:build-cusip-bridge -- --datasets=4    # 用最近 4 个（跨季扩覆盖）
 *   npm run quant:build-cusip-bridge -- --zip=/path/a.zip --zip=/path/b.zip  # 用本地缓存
 *   npm run quant:build-cusip-bridge -- --dry           # 只报不写库
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import { splitTsv, headerIndex, parseInfoTableRow, isValidCusip, isDebtLikeClass } from "../../src/lib/quant/thirteenF";
import {
  resolveSymbolCusip,
  normalizeIssuerName,
  CUSIP_OVERRIDES,
  type IssuerCandidate,
  type BridgeMatch,
} from "../../src/lib/quant/cusipBridge";
import {
  listDatasets,
  downloadZip,
  streamZipEntry,
  type Dataset,
} from "./lib13f";

const CACHE_DIR = process.env.FUNDING_CACHE_DIR || join(tmpdir(), "funding-13f");

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

/** 从一个 zip 的 INFOTABLE 累积 cusip → 候选（filer 数 = distinct accession 数） */
async function accumulateCandidates(
  zipPath: string,
  acc: Map<string, { name: string; cls: string; accessions: Set<string> }>,
): Promise<void> {
  let idx: Map<string, number> | null = null;
  await streamZipEntry(zipPath, "INFOTABLE.tsv", (line, n) => {
    if (n === 0) {
      idx = headerIndex(line);
      return;
    }
    const row = parseInfoTableRow(splitTsv(line), idx!);
    if (!row || !row.cusip) return;
    let e = acc.get(row.cusip);
    if (!e) {
      e = { name: row.nameOfIssuer, cls: row.titleOfClass, accessions: new Set() };
      acc.set(row.cusip, e);
    }
    e.accessions.add(row.accession);
  });
}

async function main() {
  const t0 = Date.now();
  const dry = argFlag("--dry");
  const localZips = argValues("--zip");
  const nDatasets = Math.max(1, Number(argValue("--datasets") ?? 1) || 1);

  // 1) 收集要扫描的 zip
  const zipPaths: string[] = [];
  if (localZips.length) {
    zipPaths.push(...localZips);
  } else {
    const all = await listDatasets();
    if (!all.length) throw new Error("SEC 13F 索引页无数据集链接");
    const picked: Dataset[] = all.slice(-nDatasets);
    console.log(`将扫描 ${picked.length} 个数据集：${picked.map((d) => d.name).join(", ")}`);
    for (const ds of picked) {
      console.log(`  下载/缓存 ${ds.name} …`);
      zipPaths.push(await downloadZip(ds, CACHE_DIR));
    }
  }

  // 2) 累积候选
  const acc = new Map<string, { name: string; cls: string; accessions: Set<string> }>();
  for (const zp of zipPaths) {
    console.log(`  扫描 INFOTABLE：${zp} …`);
    await accumulateCandidates(zp, acc);
  }
  const candidates: IssuerCandidate[] = [...acc.entries()]
    .filter(([cusip, e]) => isValidCusip(cusip) && !isDebtLikeClass(e.cls))
    .map(([cusip, e]) => ({
      cusip,
      nameOfIssuer: e.name,
      titleOfClass: e.cls,
      filerCount: e.accessions.size,
    }));
  console.log(`候选证券（有效 CUSIP）：${candidates.length}（原始 ${acc.size}）`);

  // 名称索引：normalize 后首 token → 候选（缩小每 symbol 的比对面，两侧同口径）
  const firstTok = (name: string): string => normalizeIssuerName(name).split(" ")[0] ?? "";
  const byFirstToken = new Map<string, IssuerCandidate[]>();
  for (const c of candidates) {
    const first = firstTok(c.nameOfIssuer);
    (byFirstToken.get(first) ?? byFirstToken.set(first, []).get(first)!).push(c);
  }

  // 3) 宇宙
  const uni = await prisma.$queryRawUnsafe<{ symbol: string; name: string | null; cusip: string | null }[]>(`
    SELECT DISTINCT ic.symbol, es.name, es.cusip
    FROM mds.index_constituent ic
    LEFT JOIN mds.equity_security es ON es.symbol = ic.symbol
    WHERE ic.index_code = '${SP500_INDEX_CODE}'
    ORDER BY ic.symbol
  `);
  const withName = uni.filter((u) => u.name);
  console.log(`宇宙 ${uni.length} 只（有名 ${withName.length}，无 equity_security ${uni.length - withName.length}）`);

  // 4) 匹配
  const candByCusip = new Map(candidates.map((c) => [c.cusip, c]));
  const matches: BridgeMatch[] = [];
  const unmatched: string[] = [];
  for (const u of withName) {
    // 硬覆盖优先（dual-class / 拼接名）
    const ov = CUSIP_OVERRIDES[u.symbol.toUpperCase()];
    if (ov) {
      const c = candByCusip.get(ov);
      matches.push({
        symbol: u.symbol, cusip: ov,
        matchedName: c?.nameOfIssuer ?? "(override)", titleOfClass: c?.titleOfClass ?? "",
        score: 1, method: "class-hint",
      });
      continue;
    }
    // 候选池：归一化首 token 相同的 + 全量兜底（首 token 命中为主，未命中再全扫）
    const pool = byFirstToken.get(firstTok(u.name!)) ?? [];
    const m =
      resolveSymbolCusip(u.symbol, u.name!, pool) ??
      resolveSymbolCusip(u.symbol, u.name!, candidates);
    if (m) matches.push(m);
    else unmatched.push(u.symbol);
  }

  // 5) 回填
  if (!dry) {
    let written = 0;
    for (const m of matches) {
      await prisma.equitySecurity.updateMany({
        where: { symbol: m.symbol },
        data: { cusip: m.cusip },
      });
      written++;
    }
    console.log(`回填 EquitySecurity.cusip：${written} 行`);
  }

  // 6) 报表
  const byMethod = matches.reduce<Record<string, number>>((a, m) => {
    a[m.method] = (a[m.method] ?? 0) + 1;
    return a;
  }, {});
  console.log("\n===== CUSIP 桥覆盖率 =====");
  console.log(`匹配 ${matches.length}/${withName.length}（有名宇宙）= ${((matches.length / withName.length) * 100).toFixed(1)}%`);
  console.log(`  按方法：${JSON.stringify(byMethod)}`);
  console.log(`未匹配（有名）${unmatched.length} 只：${unmatched.slice(0, 40).join(", ")}${unmatched.length > 40 ? " …" : ""}`);

  // 低置信抽查（fuzzy 且 score<0.8）供人工核对
  const lowConf = matches.filter((m) => m.method === "fuzzy" && m.score < 0.8).sort((a, b) => a.score - b.score);
  console.log(`\n低置信 fuzzy（score<0.8）${lowConf.length} 只，前 20 供核对：`);
  for (const m of lowConf.slice(0, 20)) {
    console.log(`  ${m.symbol.padEnd(7)} score=${m.score.toFixed(2)} → ${m.cusip} ${m.matchedName} [${m.titleOfClass}]`);
  }

  // 抽查几只知名股确认正确
  const spotSymbols = ["AAPL", "MSFT", "GOOGL", "GOOG", "BRK.B", "AMZN", "NVDA", "JPM", "XOM", "META"];
  console.log(`\n抽查：`);
  for (const s of spotSymbols) {
    const m = matches.find((x) => x.symbol === s);
    console.log(`  ${s.padEnd(7)} ${m ? `${m.cusip} ${m.matchedName} [${m.titleOfClass}] (${m.method})` : "未匹配"}`);
  }

  console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

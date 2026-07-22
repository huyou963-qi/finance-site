/**
 * 空头利益摄入（Phase 5 WS3）——降级实现。
 *
 * ⚠ 源可达性（WS0 probe 实证，见 [[china-server-blocked-sources]]）：
 * - FINRA cdn.finra.org / api.finra.org 从本部署被网络封锁（fetch failed，多次复现）；
 * - NASDAQ Trader 短兴趣为 JS SPA，无静态可下载文件；
 * - FMP short-interest 为付费/legacy 端点（本 key 403）。
 * → 自动抓取在本部署不可用；本脚本提供两条可用路径：
 *   1) 手工文件摄入 `--file=<路径>`（运维在非受限网络下载 FINRA/NASDAQ 双周文件后落库）——可用且可测；
 *   2) 自动抓取 `--auto`（尝试 FINRA，受限网络下会明确报「源不可达」而非静默 0）。
 *
 * PIT：可见日 = publishDate（结算日后约 8 个交易日公布）。文件缺 publishDate 时按
 * settlementDate + PUBLISH_LAG_DAYS 估算（保守，避免前视）。
 *
 * short_interest ratio / daysToCover / siChange 三个因子由 build-factors 侧从本表读数派生
 * （表有数据即自动进 FactorSnapshot；当前本部署无源 → 覆盖率透明报 0，不伪装）。
 *
 * Usage:
 *   npm run quant:sync-short-interest -- --file=./si_20240115.txt
 *   npm run quant:sync-short-interest -- --auto            # 受限网络会报源不可达
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";

/** FINRA 结算日→公布日的滞后（约 8 个交易日 ≈ 12 日历日，保守取整） */
const PUBLISH_LAG_DAYS = 12;

function argValue(name: string): string | undefined {
  const kv = process.argv.find((a) => a.startsWith(`${name}=`));
  return kv ? kv.slice(name.length + 1) : undefined;
}
function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 归一各种日期写法到 ISO；失败 null */
function toIso(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); // YYYYMMDD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); // M/D/YYYY
  if (m2) return `${m2[3]}-${m2[1]!.padStart(2, "0")}-${m2[2]!.padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

type SIRow = {
  symbol: string;
  settlementDate: string;
  publishDate: string;
  shares: number;
  avgDailyVol: number | null;
  daysToCover: number | null;
};

/** 表头列名（大写去空白）→ 我们的字段的候选别名（FINRA/NASDAQ 各版本兼容） */
const COLS = {
  symbol: ["SYMBOL", "SYMBOLCODE", "TICKER", "ISSUESYMBOL", "SECURITYSYMBOL"],
  settlement: ["SETTLEMENTDATE", "SETTLEMENTDATENUMBER", "DATE"],
  shares: ["CURRENTSHORTPOSITIONQUANTITY", "SHORTINTEREST", "SHORT INTEREST", "CURRENTSHORTPOSITION", "SHARESSHORT"],
  advol: ["AVERAGEDAILYVOLUMEQUANTITY", "AVGDAILYVOLUME", "AVERAGE DAILY VOLUME", "ADV"],
  dtc: ["DAYSTOCOVERQUANTITY", "DAYSTOCOVER", "DAYS TO COVER"],
  publish: ["PUBLICATIONDATE", "PUBLISHDATE", "SETTLEMENTDATE2"],
};

function findCol(header: string[], aliases: string[]): number {
  const norm = header.map((h) => h.trim().toUpperCase());
  for (const a of aliases) {
    const i = norm.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

/** 解析 FINRA/NASDAQ 短兴趣文件（自动判定分隔符：| tab 逗号），header 驱动 */
export function parseShortInterestFile(text: string): SIRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = lines[0]!.includes("|") ? "|" : lines[0]!.includes("\t") ? "\t" : ",";
  const header = lines[0]!.split(delim);
  const iSym = findCol(header, COLS.symbol);
  const iSet = findCol(header, COLS.settlement);
  const iSh = findCol(header, COLS.shares);
  const iAdv = findCol(header, COLS.advol);
  const iDtc = findCol(header, COLS.dtc);
  const iPub = findCol(header, COLS.publish);
  if (iSym < 0 || iSet < 0 || iSh < 0) {
    throw new Error(
      `文件表头缺关键列（需 symbol/settlementDate/shortInterest）。实际表头：${header.join(", ")}`,
    );
  }
  const out: SIRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(delim);
    const symbol = (c[iSym] ?? "").trim().toUpperCase();
    const settlementDate = toIso(c[iSet] ?? "");
    const shares = Number((c[iSh] ?? "").replace(/[, ]/g, ""));
    if (!symbol || !settlementDate || !Number.isFinite(shares)) continue;
    const publishDate =
      (iPub >= 0 ? toIso(c[iPub] ?? "") : null) ?? addDaysIso(settlementDate, PUBLISH_LAG_DAYS);
    const advol = iAdv >= 0 ? Number((c[iAdv] ?? "").replace(/[, ]/g, "")) : NaN;
    const dtc = iDtc >= 0 ? Number((c[iDtc] ?? "").replace(/[, ]/g, "")) : NaN;
    out.push({
      symbol,
      settlementDate,
      publishDate,
      shares,
      avgDailyVol: Number.isFinite(advol) && advol > 0 ? advol : null,
      daysToCover: Number.isFinite(dtc) && dtc > 0 ? dtc : null,
    });
  }
  return out;
}

async function upsertRows(rows: SIRow[], source: string): Promise<number> {
  // 只留宇宙内 symbol（有 EquitySecurity 行）
  const secs = await prisma.equitySecurity.findMany({ select: { symbol: true } });
  const universe = new Set(secs.map((s) => s.symbol));
  const keep = rows.filter((r) => universe.has(r.symbol));
  console.log(`文件 ${rows.length} 行，宇宙内 ${keep.length} 行`);

  let written = 0;
  for (let i = 0; i < keep.length; i += 1000) {
    const chunk = keep.slice(i, i + 1000);
    const values = chunk.map(
      (r) =>
        Prisma.sql`(${randomUUID()}::uuid, ${r.symbol}, ${new Date(`${r.settlementDate}T00:00:00Z`)}::date, ${new Date(`${r.publishDate}T00:00:00Z`)}::date, ${r.shares}, ${r.avgDailyVol}, ${r.daysToCover}, ${source}, CURRENT_TIMESTAMP)`,
    );
    written += await prisma.$executeRaw`
      INSERT INTO "mds"."short_interest"
        ("id","symbol","settlement_date","publish_date","shares","avg_daily_vol","days_to_cover","source","updated_at")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("symbol","settlement_date") DO UPDATE SET
        "publish_date" = EXCLUDED."publish_date",
        "shares" = EXCLUDED."shares",
        "avg_daily_vol" = EXCLUDED."avg_daily_vol",
        "days_to_cover" = EXCLUDED."days_to_cover",
        "source" = EXCLUDED."source",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }
  return written;
}

async function tryAutoFetch(): Promise<void> {
  // 意图源：FINRA 合并短兴趣（本部署被网络封锁）。明确报不可达，不静默 0。
  const url =
    process.env.SHORT_INTEREST_SOURCE_URL?.trim() ||
    "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=1";
  console.log(`自动抓取尝试：${url}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    console.log(`  HTTP ${res.status}（${res.ok ? "可达，但需按源格式实现解析" : "不可达/需鉴权"}）`);
  } catch (e) {
    console.warn(
      `  ✗ 源不可达：${e instanceof Error ? e.message : e}\n` +
        `  → 空头维度在本部署降级。可在非受限网络下载 FINRA/NASDAQ 双周文件后 --file 摄入，\n` +
        `    或设 SHORT_INTEREST_SOURCE_URL 指向可达镜像。`,
    );
  }
}

async function main() {
  const file = argValue("--file");
  if (file) {
    const text = readFileSync(file, "utf8");
    const rows = parseShortInterestFile(text);
    const written = await upsertRows(rows, argValue("--source") || "manual-file");
    console.log(`写库 ${written} 行 short_interest`);
    return;
  }
  if (argFlag("--auto")) {
    await tryAutoFetch();
    return;
  }
  console.log(
    "用法：--file=<FINRA/NASDAQ 短兴趣文件> 摄入；或 --auto 试自动源。\n" +
      "本部署 FINRA/NASDAQ 自动源受网络限制不可达（WS0 已证），空头维度降级——见脚本头注释。",
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

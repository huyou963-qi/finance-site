/** 冻结的QSTK Yahoo资料：默认核验并缓存，--apply才写入独立Q12S价格键。
 * 仅按已核验公告拆股统一OHLC尺度，写入独立Q12S价格键；未知动作仍阻断。
 * 跑完仍须显式全历史重算，日常worker不会重复下载冻结文件。
 */
import { loadEnvConfig } from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Pool } from "pg";
import { prisma } from "../../src/lib/prisma";
import { excludeLegacyYahooActionBoundaries } from "../../src/lib/data/scheduler/marketInternals/legacyYahoo";
import catalog from "./fixtures/qstk-breadth-sources.json";
import verifiedCash from "./fixtures/qstk-verified-cash-dividends.json";
import verifiedSplits from "./fixtures/qstk-verified-splits.json";
import { normalizeVerifiedLegacySplits } from "../../src/lib/data/scheduler/marketInternals/legacyYahooSplits";

loadEnvConfig(process.cwd());
const cache = ".data/market-breadth-sources/qstk-20120912";
const apply = process.argv.includes("--apply");
const source = "qstk_split_2012";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function main() {
  await mkdir(cache, { recursive: true });
  for (const [raw, events] of Object.entries(verifiedSplits)) {
    if (!catalog.files.some(item => item.raw === raw)) throw new Error(`拆股证券不在已核验原始目录中: ${raw}`);
    for (const event of events) {
      const days = await prisma.equityDailyBar.findMany({ where: { symbol: "SPY", date: { lte: new Date(`${event.date}T00:00:00Z`) } }, orderBy: { date: "desc" }, take: 2, select: { date: true } });
      if (days[0]?.date.toISOString().slice(0, 10) !== event.date || days[1]?.date.toISOString().slice(0, 10) !== event.previousDate) throw new Error(`拆股日期不符合实际交易日历: ${raw} ${event.date}`);
    }
  }
  const report = [];
  for (const rawItem of catalog.files.filter(item => item.raw in verifiedSplits)) {
    const item = { ...rawItem, target: rawItem.target.replace(/^Q12:/, "Q12S:") };
    if (!/^[A-Z][A-Z0-9-]*$/.test(item.raw) || !/^Q12S:(?:LEGACY:)?[A-Z][A-Z0-9-]*$/.test(item.target) || item.target.length > 16 || item.path !== `QSTK/QSData/Yahoo/${item.raw}.csv`) throw new Error("无效QSTK目录项");
    const file = `${cache}/${item.raw}.csv`;
    let bytes: Buffer;
    try { bytes = await readFile(file); } catch {
      const response = await fetch(`https://raw.githubusercontent.com/QuantSoftware/QuantSoftwareToolkit/${catalog.commit}/${item.path}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`QSTK ${item.raw}: HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 3_000_000) throw new Error("QSTK文件过大");
      await writeFile(file, bytes);
    }
    if (createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== item.gitBlobSha) throw new Error(`QSTK git blob校验失败: ${item.raw}`);
    const lines = bytes.toString("utf8").trim().split(/\r?\n/);
    if (lines.shift()!.split(",").map(s => s.trim()).join(",") !== "Date,Open,High,Low,Close,Volume,Adj Close") throw new Error(`QSTK表头变化: ${item.raw}`);
    const seen = new Set<string>();
    let invalid = 0;
    const rows = [];
    for (const line of lines) {
      const r = line.split(","); const date = r[0];
      if (r.length !== 7 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date) || date > catalog.lastDate) throw new Error(`QSTK日期/行结构异常: ${item.raw}`);
      seen.add(date);
      if (date < catalog.firstDate) continue;
      const [open, high, low, close, volume, adjClose] = r.slice(1).map(Number);
      if ([open, high, low, close, volume, adjClose].some(n => !Number.isFinite(n) || n < 0) || close <= 0 || adjClose <= 0 || volume <= 0) { invalid++; continue; }
      rows.push({ date, open, high, low, close, adjClose, volume });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length || (item.raw === "SII" && rows.at(-1)!.date > "2010-08-31")) throw new Error(`QSTK缺少目标发行人的历史: ${item.raw}`);
    const cashEvents = verifiedCash[item.raw as keyof typeof verifiedCash] ?? [];
    const adjusted = normalizeVerifiedLegacySplits(rows, verifiedSplits[item.raw as keyof typeof verifiedSplits], cashEvents);
    const filtered = excludeLegacyYahooActionBoundaries(adjusted.rows, adjusted.cashDividends);
    if (adjusted.verifiedSplits.some(event => !filtered.rows.some(row => row.date === event.date))) throw new Error(`拆股日未通过完整共同因子校验: ${item.raw}`);
    if (!filtered.rows.length) throw new Error(`QSTK没有可用价格片段: ${item.raw}`);
    let written = 0;
    if (apply) {
      const existing = await prisma.equityDailyBar.findMany({ where: { symbol: item.target }, orderBy: { date: "asc" } });
      if (existing.some(r => r.source !== source)) throw new Error(`QSTK目标已有其他来源: ${item.target}`);
      if (existing.length) await writeFile(`${cache}/${item.target.replace(/:/g, "_")}-before-${Date.now()}.json.gz`, gzipSync(Buffer.from(JSON.stringify(existing))));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM mds.equity_daily_bar WHERE symbol=$1 AND source=$2", [item.target, source]);
        for (let i = 0; i < filtered.rows.length; i += 4000) {
          const chunk = filtered.rows.slice(i, i + 4000);
          const data = [chunk.map(() => randomUUID()), chunk.map(() => item.target), chunk.map(r => r.date), ...(["open", "high", "low", "close", "adjClose", "volume"] as const).map(key => chunk.map(r => r[key]))];
          const result = await client.query(`INSERT INTO mds.equity_daily_bar(id,symbol,date,open,high,low,close,adj_close,volume,source,updated_at) SELECT x.*, $10::text,CURRENT_TIMESTAMP FROM unnest($1::uuid[],$2::text[],$3::date[],$4::float8[],$5::float8[],$6::float8[],$7::float8[],$8::float8[],$9::float8[])x`, [...data, source]);
          written += result.rowCount ?? 0;
        }
        if (written !== filtered.rows.length) throw new Error("QSTK写入计数不一致");
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    }
    report.push({ raw: item.raw, target: item.target, rawSha256: createHash("sha256").update(bytes).digest("hex"), sourceRows: rows.length, invalidRows: invalid, accepted: filtered.rows.length, excludedDates: filtered.excludedDates, verifiedCashDates: filtered.verifiedCashDates, cashEvidence: cashEvents, verifiedSplits: adjusted.verifiedSplits, written });
    console.log(item.target, "accepted", filtered.rows.length, "excluded", filtered.excludedDates.length, apply ? `written ${written}` : "dry-run");
  }
  await writeFile(`${cache}/backfill-splits-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), apply, repository: catalog.repository, commit: catalog.commit, priceBasis: "Split-only normalized original OHLC in isolated Q12S keys; only declared splits matching raw adjustment factors; original cent-precision Adj Close and actual volume retained; verified cash amounts normalized to the same share scale; unknown actions still excluded", report }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });


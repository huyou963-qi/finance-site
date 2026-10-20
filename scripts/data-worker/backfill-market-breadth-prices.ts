import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import path from "node:path";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const base = path.join(process.cwd(), ".data/market-breadth-sources");
type Manifest = { sha256: string; symbols: { symbol: string; first: string; last: string; rows: number }[]; splits: { symbol: string; date: string; ratio: number }[] };

async function main() {
  await mkdir(base, { recursive: true });
  const existing = await prisma.equityDailyBar.groupBy({ by: ["symbol"], _min: { date: true }, _max: { date: true }, _count: true });
  await writeFile(path.join(base, "existing-bars.json"), JSON.stringify(existing));
  if (process.argv.includes("--prepare")) {
    const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["scripts/data-worker/prepare-market-breadth-archive.py", "--download"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("WIKI历史归档准备失败");
  }
  const manifest: Manifest = JSON.parse(await readFile(path.join(base, "wiki-recovered.manifest.json"), "utf8"));
  if (manifest.sha256 !== "adfd226694c6f3ec2c56b585d973764180a39a3ec516601721e90096dc1de94f") throw new Error("WIKI归档版本校验失败");
  const bySymbol = new Map(existing.map((r) => [r.symbol, r]));
  const needed = new Set(manifest.symbols.filter((r) => {
    const yahoo = bySymbol.get(r.symbol.slice(5).replace(/_/g, "-"));
    return !yahoo?._min.date || !yahoo._max.date || yahoo._min.date.toISOString().slice(0, 10) > r.first || yahoo._max.date.toISOString().slice(0, 10) < r.last;
  }).map((r) => r.symbol));
  console.log(`WIKI archive SHA256 ${manifest.sha256}; needed ${needed.size}/${manifest.symbols.length} symbols`);
  let batch: string[][] = [];
  let recovered = 0;
  let inserted = 0;
  const dry = process.argv.includes("--dry-run");
  async function flush() {
    if (!batch.length) return;
    if (!dry) {
      const columns = Array.from({ length: 8 }, (_, index) => batch.map((r) => r[index] === "" ? null : r[index]));
      const result = await pool.query(`INSERT INTO mds.equity_daily_bar (id,symbol,date,open,high,low,close,adj_close,volume,source,updated_at)
        SELECT x.*, 'quandl_wiki',CURRENT_TIMESTAMP
        FROM unnest($1::uuid[],$2::text[],$3::date[],$4::float8[],$5::float8[],$6::float8[],$7::float8[],$8::float8[],$9::float8[]) x
        ON CONFLICT (symbol,date) DO NOTHING`, [batch.map(() => randomUUID()), ...columns]);
      inserted += result.rowCount ?? 0;
    }
    recovered += batch.length; batch = [];
  }
  const lines = createInterface({ input: createReadStream(path.join(base, "wiki-recovered.csv")), crlfDelay: Infinity });
  for await (const line of lines) {
    const row = line.split(",");
    if (!needed.has(row[0])) continue;
    if (!/^WIKI:[A-Z0-9_]{1,10}$/.test(row[0]) || row.length !== 8 || !/^\d{4}-\d{2}-\d{2}$/.test(row[1]) || row.slice(2).some((v) => !Number.isFinite(Number(v))) || Number(row[5]) <= 0 || Number(row[6]) <= 0) throw new Error("WIKI历史价格格式异常");
    batch.push(row);
    if (batch.length >= 20000) await flush();
  }
  await flush();
  if (!dry) for (const split of manifest.splits.filter((s) => needed.has(s.symbol))) {
    await prisma.equitySplit.upsert({ where: { symbol_exDate: { symbol: split.symbol, exDate: new Date(`${split.date}T00:00:00Z`) } }, create: { symbol: split.symbol, exDate: new Date(`${split.date}T00:00:00Z`), ratio: split.ratio, numerator: split.ratio, denominator: 1 }, update: { ratio: split.ratio, numerator: split.ratio, denominator: 1 } });
  }
  if (!dry) {
    const count = await prisma.equityDailyBar.count({ where: { symbol: { in: [...needed] }, source: "quandl_wiki" } });
    if (count !== recovered) throw new Error(`归档落库核对失败: expected=${recovered}, actual=${count}`);
  }
  const report = { generatedAt: new Date().toISOString(), archiveSha256: manifest.sha256, dryRun: dry, candidates: [...needed], processedBars: recovered, insertedBars: inserted, source: "quandl_wiki", namespace: "WIKI:", priceBasis: "split-adjusted; each moving-average window uses one source only" };
  await writeFile(path.join(base, "backfill-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, candidates: needed.size }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });

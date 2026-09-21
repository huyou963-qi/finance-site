/**
 * 把逐合约期货日线 CSV 导入 mds.futures_contract_bar（按唯一键幂等写入）。
 *
 * 主要用于盈透一次性回填：scripts/ibkr/backfill_gold_futures.py 在你本机连 TWS
 * 拉数据、输出 CSV（它不直连生产库），再 scp 到服务器用本脚本导入。
 *
 * CSV 表头：root,exchange,delivery_month,symbol,date,open,high,low,close,volume,source
 *
 * npm run futures:import-csv -- ibkr_out/gold_futures_ibkr.csv
 * npm run futures:import-csv -- ibkr_out/gold_futures_ibkr.csv --dry-run
 */
import { readFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const REQUIRED = [
  "root", "exchange", "delivery_month", "symbol", "date",
  "open", "high", "low", "close", "volume", "source",
] as const;

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  // 盈透缺失值有时是 -1
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("用法: npm run futures:import-csv -- <文件.csv> [--dry-run]");
    process.exit(1);
  }

  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]!.split(",").map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) throw new Error(`CSV 缺少列: ${missing.join(", ")}`);
  const col = (name: string) => header.indexOf(name);

  const rows = lines.slice(1).map((l) => l.split(","));
  const bad: string[] = [];
  const records = rows.flatMap((r, i) => {
    const date = r[col("date")]?.trim() ?? "";
    const deliveryMonth = r[col("delivery_month")]?.trim() ?? "";
    const close = num(r[col("close")]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}$/.test(deliveryMonth) || close == null) {
      bad.push(`第 ${i + 2} 行: ${r.join(",").slice(0, 80)}`);
      return [];
    }
    return [{
      root: r[col("root")]!.trim(),
      exchange: r[col("exchange")]!.trim(),
      deliveryMonth,
      symbol: r[col("symbol")]!.trim(),
      date: new Date(`${date}T00:00:00Z`),
      open: num(r[col("open")]),
      high: num(r[col("high")]),
      low: num(r[col("low")]),
      close,
      volume: num(r[col("volume")]),
      source: r[col("source")]!.trim(),
    }];
  });

  const contracts = new Set(records.map((r) => `${r.root}:${r.deliveryMonth}`));
  const dates = records.map((r) => r.date.toISOString().slice(0, 10)).sort();
  console.log(
    `[futures:import-csv] ${file}: 有效 ${records.length} 行、${contracts.size} 个合约` +
      (dates.length ? `、${dates[0]} → ${dates[dates.length - 1]}` : "") +
      (bad.length ? `；跳过无效 ${bad.length} 行` : ""),
  );
  for (const b of bad.slice(0, 5)) console.log(`  ✗ ${b}`);
  if (dryRun) {
    console.log("[futures:import-csv] dry-run，未写库");
    return;
  }

  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    await prisma.$transaction(
      records.slice(i, i + BATCH).map((r) =>
        prisma.futuresContractBar.upsert({
          where: {
            root_deliveryMonth_date_source: {
              root: r.root, deliveryMonth: r.deliveryMonth, date: r.date, source: r.source,
            },
          },
          create: r,
          update: { symbol: r.symbol, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume },
        }),
      ),
    );
  }
  console.log(`[futures:import-csv] 已写入 ${records.length} 行`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

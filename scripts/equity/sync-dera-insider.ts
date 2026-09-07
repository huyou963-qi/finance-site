/**
 * Tier B 全市场内部人交易底座——按季度灌入 SEC DERA 数据集。
 *
 * npm run equity:sync-dera-insider -- --from=2006q1              # 全量回填到最新可用季度
 * npm run equity:sync-dera-insider -- --from=2026q1 --to=2026q1  # 单季
 * npm run equity:sync-dera-insider -- --latest                   # 只补最近 2 个季度（日常增量）
 *   --cache-dir=.data/dera   缓存 zip，重跑不重复下载
 *   --force                  忽略缓存重新下载
 *
 * 遇到尚未发布的季度（404）即正常停止，不算失败。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { fetchDeraQuarterZip, DeraQuarterNotPublished } from "../../src/lib/equity/deraInsider/client";
import { ingestDeraQuarter } from "../../src/lib/equity/deraInsider/ingest";
import {
  DERA_INSIDER_FIRST_QUARTER,
  enumerateQuarters,
  isDeraQuarter,
  quarterOf,
} from "../../src/lib/equity/deraInsider/catalog";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const cacheDir = arg("cache-dir");
  const force = process.argv.includes("--force");
  const latestOnly = process.argv.includes("--latest");

  const to = arg("to") ?? quarterOf(new Date());
  let from = arg("from") ?? DERA_INSIDER_FIRST_QUARTER;
  if (latestOnly) {
    // 日常增量：只回看最近 2 个季度，覆盖 DERA 的出版滞后与事后更正
    const all = enumerateQuarters(DERA_INSIDER_FIRST_QUARTER, to);
    from = all[Math.max(0, all.length - 2)]!;
  }
  if (!isDeraQuarter(from) || !isDeraQuarter(to)) {
    throw new Error(`季度参数无效：from=${from} to=${to}`);
  }

  const quarters = enumerateQuarters(from, to);
  console.log(`[dera-insider] 计划 ${quarters.length} 个季度：${quarters[0]} → ${quarters[quarters.length - 1]}`);

  let ok = 0;
  let totalTrans = 0;
  const started = Date.now();
  for (const q of quarters) {
    const t0 = Date.now();
    try {
      const buf = await fetchDeraQuarterZip(q, { cacheDir, force });
      const s = await ingestDeraQuarter(prisma, q, buf);
      totalTrans += s.transactions;
      ok += 1;
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `  ✓ ${q}  申报 ${s.filings.toLocaleString()}  交易 ${s.transactions.toLocaleString()}  ` +
          `申报人 ${s.owners.toLocaleString()}  跳过(头/交易/脏行) ${s.skippedFilings}/${s.skippedTransactions}/${s.skippedRows}  异常标记 ${s.anomalies}` +
          `${s.hasPlanColumn ? "" : "  [无10b5-1列]"}  ${secs}s`,
      );
    } catch (e) {
      if (e instanceof DeraQuarterNotPublished) {
        console.log(`  · ${q} 尚未发布，到此为止`);
        break;
      }
      throw e;
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`[dera-insider] 完成 ${ok} 个季度，累计交易 ${totalTrans.toLocaleString()} 笔，用时 ${mins} 分钟`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Tier B 价格交叉校验：用 mds.equity_daily_bar 的实际股价核对 Form 4 申报价，
 * 把结果写进 dera_insider_transaction.price_check。
 *
 * npm run equity:check-dera-prices              # 全量（按季度分批）
 * npm run equity:check-dera-prices -- --from=2020q1
 *
 * 为什么需要：SEC 原样发布申报人填写的价格，量级错位（×10^3/×10^6）并不罕见，
 * 且不限于冷门票（LLY 2023-08-28 报 554101，当日真实约 $554）。实测这类行占比
 * 万分之几，却贡献了全库 99.9% 的金额——不校验就无法做任何金额汇总。
 *
 * ⚠ 关键：`equity_daily_bar` 存的是**向今天复权后**的价格，而 Form 4 申报的是
 * **当日真实成交价**，两者口径不同。必须乘上交易日之后发生的累计拆股比例把日线
 * 还原回当日口径，否则所有拆股前的交易都会被误判——实测不做这步时误判率 14.3%
 * （AAPL 2020-08-25 申报 499.42 会被拿去和复权后的 124.81 比，差 4 倍即那次 4:1 拆股），
 * 做了之后降到 0.26%。
 *
 * ⚠ 只校验 P/S（公开市场买卖）。M 的价是行权价、A 是授予价，与市价本就没有可比性，
 * 一并校验会把正常的期权行权全部误判。其余交易码保持 price_check=null。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 偏离达一个量级才判错。真实成交价与当日收盘可以有正常价差，10 倍留足余量。 */
const DEVIATION = 10;

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const from = arg("from");
  const quarters = (
    (await prisma.$queryRawUnsafe(
      `select distinct source_quarter q from mds.dera_insider_filing order by q`,
    )) as { q: string }[]
  )
    .map((r) => r.q)
    .filter((q) => !from || q >= from);

  console.log(`[check-dera-prices] ${quarters.length} 个季度，偏离阈值 ${DEVIATION}x`);

  let verified = 0;
  let outlier = 0;
  const started = Date.now();

  for (const quarter of quarters) {
    // 参照价 = 交易日当天或之前最近一根日线的 close × 该日之后的累计拆股比例
    const sql = `
      WITH ref AS (
        SELECT t.accession, t.trans_sk,
          (SELECT b.close FROM mds.equity_daily_bar b
             WHERE b.symbol = t.issuer_symbol AND b.date <= t.transaction_date
             ORDER BY b.date DESC LIMIT 1)
          * COALESCE((SELECT exp(sum(ln(s.ratio))) FROM mds.equity_split s
             WHERE s.symbol = t.issuer_symbol AND s.ex_date > t.transaction_date AND s.ratio > 0), 1)
          AS ref_px,
          t.price_per_share AS px
        FROM mds.dera_insider_transaction t
        JOIN mds.dera_insider_filing f ON f.accession = t.accession
        WHERE f.source_quarter = $1
          AND t.anomaly IS NULL
          AND t.transaction_code IN ('P','S')
          AND t.price_per_share > 0
      )
      UPDATE mds.dera_insider_transaction t
      SET price_check = CASE
            WHEN ref.px BETWEEN ref.ref_px / ${DEVIATION} AND ref.ref_px * ${DEVIATION} THEN 'verified'
            ELSE 'outlier' END
      FROM ref
      WHERE t.accession = ref.accession AND t.trans_sk = ref.trans_sk
        AND ref.ref_px IS NOT NULL AND ref.ref_px > 0`;
    await prisma.$executeRawUnsafe(sql, quarter);

    const [row] = (await prisma.$queryRawUnsafe(
      `select count(*) filter (where t.price_check='verified')::int v,
              count(*) filter (where t.price_check='outlier')::int o
       from mds.dera_insider_transaction t
       join mds.dera_insider_filing f on f.accession=t.accession
       where f.source_quarter=$1`,
      quarter,
    )) as { v: number; o: number }[];
    verified += row?.v ?? 0;
    outlier += row?.o ?? 0;
    console.log(`  ✓ ${quarter}  verified=${row?.v ?? 0}  outlier=${row?.o ?? 0}`);
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  const rate = verified + outlier > 0 ? ((outlier / (verified + outlier)) * 100).toFixed(2) : "0";
  console.log(
    `[check-dera-prices] 完成：verified ${verified.toLocaleString()} / outlier ${outlier.toLocaleString()}（${rate}%），用时 ${mins} 分钟`,
  );
  console.log("  金额汇总请用 where anomaly is null and price_check='verified'");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

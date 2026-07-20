/**
 * 验收 WS1：EquityFundamentalSnapshot.firstReportedAt 与 SecFiling.filedAt 交叉核对。
 *
 * 期望语义：每季 firstReportedAt ≈ 该财季期末后第一份 10-Q/10-K 的 filed 日
 * （差分派生季 = 10-K filed 日，同样落在此规则内：Q4 期末后的第一份定期报告就是 10-K）。
 * SecFiling 由 sync-sec / stockEvents 懒回补，覆盖不全的 symbol 自动跳过对应季度。
 *
 * Usage:
 *   npm run equity:verify-first-reported                    # 默认 20 只样本
 *   npm run equity:verify-first-reported -- --symbols=AAPL,MSFT
 */
import { prisma } from "../../src/lib/prisma";

const DEFAULT_SAMPLE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "BRK-B", "XOM",
  "UNH", "JNJ", "PG", "COST", "LLY", "V", "WMT", "HD", "MRK", "DECK",
];

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const DAY_MS = 86_400_000;

async function main() {
  const symbols = (argValue("--symbols")?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)) ?? DEFAULT_SAMPLE;

  let compared = 0;
  let exact = 0;
  let within3 = 0;
  let within14 = 0;
  const outliers: string[] = [];
  const noFiling: string[] = [];

  for (const symbol of symbols) {
    const rows = await prisma.equityFundamentalSnapshot.findMany({
      where: { symbol, periodType: "Q", firstReportedAt: { not: null }, fiscalDate: { not: null } },
      orderBy: { fiscalDate: "asc" },
      select: { period: true, fiscalDate: true, firstReportedAt: true },
    });
    if (!rows.length) {
      console.warn(`skip ${symbol}: 无带 firstReportedAt 的 Q 行`);
      continue;
    }
    const filings = await prisma.secFiling.findMany({
      where: { symbol, form: { in: ["10-Q", "10-K", "10-Q/A", "10-K/A"] } },
      orderBy: { filedAt: "asc" },
      select: { form: true, filedAt: true },
    });
    if (!filings.length) {
      noFiling.push(symbol);
      continue;
    }

    let cmpForSymbol = 0;
    for (const r of rows) {
      const fiscal = r.fiscalDate!.getTime();
      // 期末后 150 天内第一份非修正定期报告 = 该季首次披露的期望日
      const expect = filings.find(
        (f) =>
          (f.form === "10-Q" || f.form === "10-K") &&
          f.filedAt.getTime() > fiscal &&
          f.filedAt.getTime() <= fiscal + 150 * DAY_MS,
      );
      if (!expect) continue;
      // SecFiling 覆盖缺口保护：正常 10-Q 滞后 ≤45d、10-K ≤90d；若库内第一份
      // 期后申报离期末 >100d，说明本期自己的报告不在库内（懒回补只有近两年），跳过
      if (expect.filedAt.getTime() - fiscal > 100 * DAY_MS) continue;
      const diff = Math.round((r.firstReportedAt!.getTime() - expect.filedAt.getTime()) / DAY_MS);
      compared += 1;
      cmpForSymbol += 1;
      const ad = Math.abs(diff);
      if (ad === 0) exact += 1;
      else if (ad <= 3) within3 += 1;
      else if (ad <= 14) within14 += 1;
      else {
        outliers.push(
          `${symbol} ${r.period} fiscal=${r.fiscalDate!.toISOString().slice(0, 10)} fra=${r.firstReportedAt!.toISOString().slice(0, 10)} expect=${expect.filedAt.toISOString().slice(0, 10)}(${expect.form}) diff=${diff}d`,
        );
      }
    }
    console.log(`ok ${symbol} rows=${rows.length} filings=${filings.length} compared=${cmpForSymbol}`);
  }

  console.log("\n== 偏差报表 ==");
  console.log(
    JSON.stringify(
      {
        compared,
        exact,
        within3d: within3,
        within14d: within14,
        over14d: outliers.length,
        exactPct: compared ? +(100 * exact / compared).toFixed(1) : null,
        within3dPct: compared ? +(100 * (exact + within3) / compared).toFixed(1) : null,
        noFilingSymbols: noFiling,
      },
      null,
      2,
    ),
  );
  if (outliers.length) {
    console.log("\n偏差 >14 天的行：");
    for (const o of outliers) console.log("  " + o);
  }
  // 验收线：≥90% 的可比行与 EDGAR filed 日误差 ≤3 天
  const pass = compared > 0 && (exact + within3) / compared >= 0.9;
  console.log(pass ? "\n验收通过 ✔（≥90% 在 ±3 天内）" : "\n验收未达标 ✘");
  if (!pass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

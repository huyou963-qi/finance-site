/**
 * 同步行业基本面快照（主路径：SEC companyfacts，免密钥）。
 * FMP 当前套餐对 period=quarter 的 ratios/income 常 402，不再作为默认源。
 *
 * Usage:
 *   npm run equity:sync-fundamentals                     # 年报 FY 快照
 *   npm run equity:sync-fundamentals -- --limit=100
 *   npm run equity:sync-fundamentals -- --period-type=Q --quarters=12   # 季度三表
 *   npm run equity:sync-fundamentals -- --period-type=Q --symbols=AAPL,MSFT,JPM
 *   # 深历史回填（幂等可续跑）：名单走文件，成功的 symbol 记进 resume-log，重跑自动跳过
 *   npm run equity:sync-fundamentals -- --period-type=Q --quarters=70 \
 *     --symbols-file=tmp/backfill-universe.txt --resume-log=tmp/backfill.log
 *
 * 注意：`--limit` 只在「无显式名单」模式下默认生效（100）；给了 --symbols/--symbols-file
 * 时默认不截断（历史上 --limit 静默截断名单是踩过的坑），要截断请显式传 --limit。
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "../../src/lib/prisma";
import {
  extractAnnualFundamentals,
  extractQuarterlyFundamentals,
  fetchSecCompanyFacts,
  fetchSecTickerCikMap,
  fetchYahooLastClose,
} from "../../src/lib/equity/secFundamentals";
import { upsertQuarterlyFundamentals } from "../../src/lib/equity/equityFundamentalsStore";

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 名单文件：每行一个 symbol，支持逗号分隔与 `#` 注释 */
function readSymbolsFile(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .flatMap((l) => l.split(","))
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** resume-log 里已成功的 symbol（失败的不记，重跑自动重试） */
function readResumeLog(path: string): Set<string> {
  try {
    return new Set(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

async function main() {
  const limitArg = argValue("--limit");
  const delayMs = Math.max(120, Number(argValue("--delay-ms") ?? 200) || 200);
  const periodType = (argValue("--period-type") ?? "FY").toUpperCase();
  const quarters = Math.max(4, Number(argValue("--quarters") ?? 20) || 20);
  const symbolsArg = argValue("--symbols");
  const symbolsFile = argValue("--symbols-file");
  const resumeLog = argValue("--resume-log");

  const explicit = [
    ...(symbolsArg ? symbolsArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : []),
    ...(symbolsFile ? readSymbolsFile(symbolsFile) : []),
  ];
  const onlySymbols = explicit.length ? new Set(explicit) : null;
  // 显式名单模式下 --limit 默认不生效（避免静默截断）
  const limit = limitArg
    ? Math.max(1, Number(limitArg) || 100)
    : onlySymbols
      ? Number.POSITIVE_INFINITY
      : 100;

  const done = resumeLog ? readResumeLog(resumeLog) : new Set<string>();
  if (resumeLog) {
    mkdirSync(dirname(resumeLog), { recursive: true });
    if (done.size) console.log(`resume-log 已完成 ${done.size} 只，将跳过`);
  }
  const markDone = (symbol: string) => {
    if (resumeLog) appendFileSync(resumeLog, `${symbol}\n`, "utf8");
  };

  console.log("Loading SEC ticker→CIK map…");
  const cikMap = await fetchSecTickerCikMap();

  const securities = await prisma.equitySecurity.findMany({
    where: onlySymbols ? { symbol: { in: [...onlySymbols] } } : undefined,
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
    take: onlySymbols ? undefined : Math.max(limit * 3, 200),
    select: { symbol: true, cik: true, marketCap: true },
  });
  if (onlySymbols) {
    const found = new Set(securities.map((s) => s.symbol));
    const missing = [...onlySymbols].filter((s) => !found.has(s));
    if (missing.length) console.warn(`不在 equity_security（跳过 ${missing.length}）：${missing.join(",")}`);
  }

  // 回填缺失 CIK，并挑出有 CIK 的前 limit 只
  const withCik: { symbol: string; cik: string }[] = [];
  for (const row of securities) {
    let cik = row.cik;
    if (!cik) {
      const mapped = cikMap.get(row.symbol);
      if (mapped) {
        cik = mapped;
        await prisma.equitySecurity.update({
          where: { symbol: row.symbol },
          data: { cik: mapped },
        });
      }
    }
    if (cik) withCik.push({ symbol: row.symbol, cik });
    if (withCik.length >= limit) break;
  }

  if (!withCik.length) {
    console.error("无可用 CIK：请先 equity:seed-sp500，并确认可访问 sec.gov");
    process.exitCode = 1;
    return;
  }

  let ok = 0;
  let fail = 0;
  let skipped = 0;
  const failed: string[] = [];
  const t0 = Date.now();
  const total = withCik.length;
  let seen = 0;

  for (const { symbol, cik } of withCik) {
    seen += 1;
    if (done.has(symbol)) {
      skipped += 1;
      continue;
    }
    try {
      const facts = await fetchSecCompanyFacts(cik);

      if (periodType === "Q") {
        const rows = extractQuarterlyFundamentals(facts, { maxQuarters: quarters });
        if (!rows.length) {
          fail += 1;
          failed.push(symbol);
          console.warn(`no quarterly facts: ${symbol}`);
          await sleep(delayMs);
          continue;
        }
        const n = await upsertQuarterlyFundamentals(symbol, rows);
        ok += 1;
        markDone(symbol);
        const first = rows[0]!;
        const last = rows[rows.length - 1]!;
        const eta = ((Date.now() - t0) / Math.max(1, ok + fail)) * (total - seen);
        console.log(
          `ok [${seen}/${total}] ${symbol} Q×${n} ${first.fiscalDate}→${last.fiscalDate} rev=${last.revenue?.toExponential(2) ?? "n/a"} revYoY=${last.revenueYoY?.toFixed(3) ?? "n/a"} eta=${(eta / 60000).toFixed(0)}m`,
        );
        await sleep(delayMs);
        continue;
      }

      const snap = extractAnnualFundamentals(facts);
      if (!snap) {
        fail += 1;
        failed.push(symbol);
        console.warn(`no annual facts: ${symbol}`);
        await sleep(delayMs);
        continue;
      }

      let pe: number | null = null;
      if (snap.eps != null && snap.eps !== 0) {
        const px = await fetchYahooLastClose(symbol);
        if (px != null) pe = px / snap.eps;
      }

      const asOf = new Date(`${snap.asOf}T00:00:00.000Z`);
      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period: snap.period } },
        create: {
          symbol,
          period: snap.period,
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
        update: {
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
      });

      // 兼容聚合：再写一条 TTM 别名指向同一套年报指标
      await prisma.equityFundamentalSnapshot.upsert({
        where: { symbol_period: { symbol, period: "TTM" } },
        create: {
          symbol,
          period: "TTM",
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
        update: {
          revenue: snap.revenue,
          revenueYoY: snap.revenueYoY,
          eps: snap.eps,
          epsYoY: snap.epsYoY,
          grossMargin: snap.grossMargin,
          opMargin: snap.opMargin,
          pe,
          asOf,
        },
      });

      ok += 1;
      markDone(symbol);
      console.log(
        `ok ${symbol} ${snap.period} revYoY=${snap.revenueYoY?.toFixed(3) ?? "n/a"} pe=${pe?.toFixed(1) ?? "n/a"}`,
      );
    } catch (e) {
      fail += 1;
      failed.push(symbol);
      console.warn(`fail ${symbol}:`, e instanceof Error ? e.message : e);
    }
    await sleep(delayMs);
  }

  console.log(
    JSON.stringify(
      {
        attempted: withCik.length,
        ok,
        fail,
        skipped,
        elapsedMin: Number(((Date.now() - t0) / 60000).toFixed(1)),
        failedSymbols: failed,
      },
      null,
      2,
    ),
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

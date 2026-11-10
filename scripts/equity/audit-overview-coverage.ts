/**
 * 基本面概览「七个维度」数据覆盖自检：哪些指标因财报科目缺失而画不出来。
 *
 * 用途：基本面底座回填后回头核对各指标是否已补齐。只读库，不触发 SEC 抓取。
 *
 * npm run equity:audit-overview-coverage                       # 市值前 200
 * npm run equity:audit-overview-coverage -- --limit=1000
 * npm run equity:audit-overview-coverage -- --symbols=AAPL,JPM,O --detail
 *
 * 口径：每只股票取最近 20 季，看每条系列在「最近 8 季」里有几个点。
 * 8 季全空 = 缺失；有值但不满 = 部分（TTM/同比类前几季天然为空，不计入）。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { getQuarterlyFundamentalsDbFirst } from "../../src/lib/equity/equityFundamentalsStore";
import { buildOverviewDimensions, chooseOverviewProfile, dimensionBlueprint } from "../../src/lib/equity/overviewDimensions";
import { STATEMENT_PROFILE_NAMES, type StatementProfile } from "../../src/lib/equity/statementTemplate";

const prisma = new PrismaClient();
const RECENT = 8;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** 有季度报表的股票里取规模最大的 N 只：优先市值，库里没有市值时按最新单季营收 */
async function pickLargest(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ symbol: string }[]>(
    `select s.symbol
       from (select distinct on (symbol) symbol, revenue
               from mds.equity_fundamental_snapshot
              where period_type = 'Q'
              order by symbol, as_of desc) s
       left join mds.equity_security e on e.symbol = s.symbol
      -- 优先股等（GS-PD、ALL-PH）与普通股共用同一套报表，只算普通股
      where s.symbol !~ '-P[A-Z]?$'
      order by e.market_cap desc nulls last, s.revenue desc nulls last
      limit $1`,
    limit,
  );
  return rows.map((r) => r.symbol);
}

type Tally ={ stocks: number; missing: number; partial: number; missingSymbols: string[] };

async function main() {
  const detail = process.argv.includes("--detail");
  const limit = Number(arg("limit") ?? 200);
  const symbols = arg("symbols")
    ?.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    ?? (await pickLargest(limit));

  // profile → "维度/系列" → 统计
  const tallies = new Map<StatementProfile, Map<string, Tally>>();
  const profileCount = new Map<StatementProfile, number>();
  let noData = 0;

  for (const symbol of symbols) {
    const rows = await getQuarterlyFundamentalsDbFirst(symbol, { quarters: 20, lazy: false });
    if (rows.length < RECENT) {
      noData += 1;
      if (detail) console.log(`${symbol}: 季度不足 ${RECENT}（${rows.length}）`);
      continue;
    }
    const profile = chooseOverviewProfile(rows);
    profileCount.set(profile, (profileCount.get(profile) ?? 0) + 1);
    const built = buildOverviewDimensions(rows, profile);
    const byKey = new Map<string, number>();
    for (const chart of built.charts) {
      for (const ser of chart.series) {
        byKey.set(`${chart.index}.${chart.title} / ${ser.name}`, ser.data.slice(-RECENT).filter((v) => v != null).length);
      }
    }

    const t = tallies.get(profile) ?? new Map<string, Tally>();
    tallies.set(profile, t);
    const lines: string[] = [];
    // 以蓝图为准：buildOverviewDimensions 会丢掉全空系列，缺失的要靠蓝图补回来
    for (const key of dimensionBlueprint(profile)) {
      const n = byKey.get(key) ?? 0;
      const tally = t.get(key) ?? { stocks: 0, missing: 0, partial: 0, missingSymbols: [] };
      tally.stocks += 1;
      if (n === 0) {
        tally.missing += 1;
        tally.missingSymbols.push(symbol);
        lines.push(`  ✗ ${key}`);
      } else if (n < RECENT) {
        tally.partial += 1;
        lines.push(`  ~ ${key}（${n}/${RECENT}）`);
      }
      t.set(key, tally);
    }
    if (detail) {
      console.log(`${symbol} [${STATEMENT_PROFILE_NAMES[profile]}]${lines.length ? "" : " 全部齐全"}`);
      for (const l of lines) console.log(l);
    }
  }

  console.log(`\n共 ${symbols.length} 只；季度不足 ${RECENT} 的 ${noData} 只未计入。`);
  for (const [profile, t] of tallies) {
    console.log(`\n== ${STATEMENT_PROFILE_NAMES[profile]}（${profileCount.get(profile)} 只）==`);
    const rows = [...t.entries()].sort((a, b) => b[1].missing - a[1].missing);
    for (const [key, v] of rows) {
      const full = v.stocks - v.missing - v.partial;
      const pct = (n: number) => `${((n / v.stocks) * 100).toFixed(0)}%`.padStart(4);
      const sample = v.missingSymbols.slice(0, 6).join(",");
      console.log(
        `  齐 ${pct(full)} · 部分 ${pct(v.partial)} · 缺 ${pct(v.missing)}  ${key}${v.missing ? `  例：${sample}` : ""}`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * 重建 S&P 500 历史成分（月末粒度）→ mds.index_constituent。
 *
 * 数据源：git HTML 快照 scripts/equity/fixtures/wikipedia-sp500-page.html
 * （同页含 id="constituents" 当前表与 id="changes" 变更表，两表天然同一修订版本；
 * 墙内生产服务器抓不到 Wikipedia，快照惯例同 sp500-snapshot.json）。
 * 算法：当前名单按变更表反向回放（见 wikipediaSp500Changes.ts）。
 * 历史行以现价库 symbol 表达（FB 时代记为 META，见 SP500_TICKER_ALIASES）。
 *
 * Usage:
 *   npm run equity:rebuild-sp500-history                       # 回放到 2000-01，写库
 *   npm run equity:rebuild-sp500-history -- --from=2005-01
 *   npm run equity:rebuild-sp500-history -- --dry-run          # 只回放与体检，不写库
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../src/lib/prisma";
import { SP500_INDEX_CODE } from "../../src/lib/equity/equitySecurities";
import { parseWikipediaSp500Html } from "../../src/lib/equity/wikipediaSp500";
import {
  normalizeSp500Ticker,
  parseWikipediaSp500Changes,
  rebuildMonthlyMembership,
  sliceTableById,
} from "../../src/lib/equity/wikipediaSp500Changes";

const FIXTURE_PATH = join(__dirname, "fixtures", "wikipedia-sp500-page.html");
const META_PATH = join(__dirname, "fixtures", "wikipedia-sp500-page.meta.json");

function argValue(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

async function main() {
  const fromMonth = argValue("--from") ?? "2000-01";
  const dryRun = process.argv.includes("--dry-run");

  const html = readFileSync(FIXTURE_PATH, "utf8");
  const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as { fetchedAt: string };
  const anchorDate = meta.fetchedAt;

  // 当前成分：只喂 constituents 表切片，避免 changes 表行掺入
  const constituentsHtml = sliceTableById(html, "constituents");
  if (!constituentsHtml) throw new Error('未找到 id="constituents" 当前成分表');
  const current = parseWikipediaSp500Html(constituentsHtml)
    .map((r) => normalizeSp500Ticker(r.symbol))
    .filter((s): s is string => s != null);
  if (current.length < 400) throw new Error(`当前成分行数异常: ${current.length}`);

  const changes = parseWikipediaSp500Changes(html);
  console.log(
    `[rebuild] anchor=${anchorDate} current=${current.length} changes=${changes.length}（${changes[changes.length - 1]?.date} ~ ${changes[0]?.date}）`,
  );

  const { months, warnings } = rebuildMonthlyMembership(current, changes, {
    anchorDate,
    fromMonth,
  });

  for (const w of warnings) console.warn(`[warn] ${w.date} ${w.message}`);
  console.log(`[rebuild] 月末快照 ${months.length} 个，警告 ${warnings.length} 条`);

  // 体检：名单规模应在 495–510（现行 503，双类股导致 >500）
  const sizeOutliers = months.filter((m) => m.symbols.length < 495 || m.symbols.length > 510);
  for (const m of sizeOutliers.slice(0, 12)) {
    console.warn(`[size] ${m.asOfDate} → ${m.symbols.length}`);
  }
  if (sizeOutliers.length) {
    console.warn(`[size] 超出 [495,510] 的月份共 ${sizeOutliers.length} 个（越早越可能缺行）`);
  }

  if (dryRun) {
    for (const probe of ["2010-06-30", "2015-06-30", "2020-06-30", "2020-11-30", "2020-12-31"]) {
      const m = months.find((x) => x.asOfDate === probe);
      if (m) {
        console.log(
          `[probe] ${probe} n=${m.symbols.length} TSLA=${m.symbols.includes("TSLA")} DD=${m.symbols.includes("DD")} AAPL=${m.symbols.includes("AAPL")}`,
        );
      }
    }
    return;
  }

  // 写库：先清掉历史重建行（月末日期），保留 seed-sp500 写入的当日快照行
  const monthEnds = months.map((m) => new Date(`${m.asOfDate}T00:00:00.000Z`));
  const deleted = await prisma.indexConstituent.deleteMany({
    where: { indexCode: SP500_INDEX_CODE, asOfDate: { in: monthEnds } },
  });
  console.log(`[rebuild] 清理旧月末行 ${deleted.count}`);

  let written = 0;
  for (const m of months) {
    const asOfDate = new Date(`${m.asOfDate}T00:00:00.000Z`);
    await prisma.indexConstituent.createMany({
      data: m.symbols.map((symbol) => ({ indexCode: SP500_INDEX_CODE, symbol, asOfDate })),
      skipDuplicates: true,
    });
    written += m.symbols.length;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        anchorDate,
        fromMonth,
        months: months.length,
        rowsWritten: written,
        warnings: warnings.length,
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

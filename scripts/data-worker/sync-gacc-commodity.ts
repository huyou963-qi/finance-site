/**
 * 海关总署主要商品量值表——全量抓取/回填
 *
 * npm run data:sync-gacc-commodity                 （回填 2020 至今全部月份）
 * npm run data:sync-gacc-commodity -- --from=2026  （只回填 2026 年至今）
 * npm run data:sync-gacc-commodity -- --latest-only（只抓当年最近一期，部署快速模式）
 * npm run data:sync-gacc-commodity -- --dry-run    （只解析不写库）
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import type { ObservationPoint } from "../../src/lib/data/scheduler/types";
import {
  GACC_COMMODITY_FIRST_YEAR,
  GACC_DIRECTIONS,
} from "../../src/lib/data/scheduler/gaccCommodity/catalog";
import {
  fetchGaccCommodityTable,
  fetchGaccMonthlyIndex,
} from "../../src/lib/data/scheduler/gaccCommodity/client";
import { parseGaccMonthlyIndex } from "../../src/lib/data/scheduler/gaccCommodity/parseMonthlyIndex";
import { parseGaccCommodityTable } from "../../src/lib/data/scheduler/gaccCommodity/parseCommodityTable";
import { buildGaccSeriesPoints } from "../../src/lib/data/scheduler/gaccCommodity/toSeriesPoints";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const latestOnly = process.argv.includes("--latest-only");
  const currentYear = new Date().getUTCFullYear();
  const fromYear = latestOnly
    ? currentYear
    : Number(argValue("from")) || GACC_COMMODITY_FIRST_YEAR;
  const years = Array.from({ length: currentYear - fromYear + 1 }, (_, i) => fromYear + i);

  const byCode = new Map<string, ObservationPoint[]>();
  const skippedCombined: string[] = [];
  const cnyPeriods: string[] = [];
  let periods = 0;

  for (const year of years) {
    for (const direction of GACC_DIRECTIONS) {
      const index = await fetchGaccMonthlyIndex(year, currentYear);
      let links = parseGaccMonthlyIndex(index, direction);
      if (latestOnly) links = links.slice(-1);
      for (const link of links) {
        const parsed = parseGaccCommodityTable(await fetchGaccCommodityTable(link.url));
        const period = `${year}-${String(link.month).padStart(2, "0")} ${direction}`;
        if (parsed.monthSpan > 1) {
          // 1、2 月合并发布的期次：当月列其实是两个月之和，不能当单月值入库
          skippedCombined.push(`${period}(span=${parsed.monthSpan})`);
          continue;
        }
        const built = buildGaccSeriesPoints(direction, parsed);
        if (built.valueSkippedByCurrency) cnyPeriods.push(`${period}(${parsed.valueUnit.raw})`);
        for (const { code, point } of built.points) {
          const rows = byCode.get(code) ?? [];
          rows.push(point);
          byCode.set(code, rows);
        }
        periods += 1;
        await sleep(900); // 串行限速，不并发轰炸源站
      }
    }
  }

  console.log(
    `[sync-gacc-commodity] 解析完成：期数=${periods}，序列=${byCode.size}，` +
      `观测点=${[...byCode.values()].reduce((n, r) => n + r.length, 0)}`,
  );
  if (skippedCombined.length) {
    console.log(`[sync-gacc-commodity] 跳过合并期：${skippedCombined.join(", ")}`);
  }
  if (cnyPeriods.length) {
    console.log(
      `[sync-gacc-commodity] 非美元计价期（只落数量，不落金额/单价）：${cnyPeriods.join(", ")}`,
    );
  }
  if (dryRun) {
    console.log("[sync-gacc-commodity] --dry-run：未写库");
    return;
  }

  let upserted = 0;
  let skipped = 0;
  let missingInstruments = 0;
  for (const [code, rows] of byCode) {
    const instrument = await prisma.instrument.findUnique({ where: { code }, select: { id: true } });
    if (!instrument) {
      missingInstruments += 1;
      continue;
    }
    rows.sort((a, b) => a.obsDate.getTime() - b.obsDate.getTime());
    const result = await upsertMacroObservations(prisma, instrument.id, rows);
    upserted += result.upserted;
    skipped += result.skipped;
  }
  if (missingInstruments) {
    throw new Error(
      `[sync-gacc-commodity] ${missingInstruments} 条序列在库中找不到仪器，请先 npm run data:seed-gacc-commodity`,
    );
  }
  console.log(`[sync-gacc-commodity] 完成：upserted=${upserted} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

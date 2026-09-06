/**
 * Ritter 美股 IPO 月度统计——自检
 *
 * npm run data:verify-ritter-ipo
 * npm run data:verify-ritter-ipo -- --db
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import { readFetchAcquisition } from "../../src/lib/data/scheduler/fetchAcquisition";
import {
  RITTER_IPO_SERIES,
  type RitterIpoSeriesKey,
} from "../../src/lib/data/scheduler/ritterIpo/catalog";

/** 实测全历史点数（2026-09 抓取时）：各分项起始年份不同，故预期条数差异很大 */
const MIN_COUNT: Record<RitterIpoSeriesKey, number> = {
  first_day_return: 700,
  count_gross: 750,
  count_net: 580,
  above_midpoint_pct: 500,
};

/**
 * ⚠ 这是**年度更新**的研究数据集：上一年的数据要到次年 1 月才补齐。
 * 所以"最新观测落后 9–14 个月"是正常状态，不是故障。阈值给到 24 个月，
 * 只拦住"整整两年没更新"这种真的断更。
 */
const MAX_STALE_MONTHS = 24;

async function main() {
  let errors = 0;
  const useDb = process.argv.includes("--db");
  console.log(
    `[verify-ritter-ipo] 目标仪器 ${RITTER_IPO_SERIES.map((s) => s.instrumentCode).join(", ")}`,
  );

  if (!useDb) {
    console.log("[verify-ritter-ipo] 通过（加 --db 检查数据库）");
    return;
  }

  const prisma = new PrismaClient();
  try {
    for (const row of RITTER_IPO_SERIES) {
      const code = row.instrumentCode;
      const inst = await prisma.instrument.findUnique({ where: { code } });
      if (!inst) {
        console.error(`  ✗ ${code}：缺 Instrument（先 data:seed-ritter-ipo）`);
        errors++;
        continue;
      }

      const acq = readFetchAcquisition(inst.metadata);
      if (acq?.status !== "known") {
        console.error(`  ✗ ${code}：fetchAcquisition.status=${acq?.status ?? "无"}（应 known）`);
        errors++;
      }
      const md = (inst.metadata ?? {}) as Record<string, unknown>;
      const scrape = md.scrape as Record<string, unknown> | undefined;
      if (scrape?.provider !== row.provider) {
        console.error(`  ✗ ${code}：scrape.provider=${scrape?.provider ?? "无"}（应 ${row.provider}）`);
        errors++;
      }
      if (md.bootstrapOnly === true) {
        console.error(`  ✗ ${code}：bootstrapOnly=true（应 false，否则不参与 worker）`);
        errors++;
      }
      if (md.catalogCategory !== row.category) {
        console.error(`  ✗ ${code}：catalogCategory=${String(md.catalogCategory)}（应 ${row.category}）`);
        errors++;
      }

      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: inst.id } });
      if (!sub?.enabled) {
        console.error(`  ✗ ${code}：订阅未启用`);
        errors++;
      } else if ((sub.releaseRule as { type?: string })?.type !== "probe_interval") {
        console.error(
          `  ✗ ${code}：releaseRule 应 probe_interval，实际 ${(sub.releaseRule as { type?: string })?.type}`,
        );
        errors++;
      }

      const count = await prisma.macroObservation.count({ where: { instrumentId: inst.id } });
      const first = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "asc" },
      });
      const last = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const minCount = MIN_COUNT[row.seriesKey];
      if (count < minCount) {
        console.error(`  ✗ ${code}：观测仅 ${count} 条（预期 ≥${minCount}）`);
        errors++;
      }

      // 各分项起始月份是源口径决定的硬事实（净家数 1975-01、中值占比 1980-01），
      // 对不上说明列取错了——这是本数据集最容易犯的错，必须拦住。
      const firstIso = first?.obsDate.toISOString().slice(0, 7);
      if (firstIso !== row.firstObsMonth) {
        console.error(`  ✗ ${code}：最早观测 ${firstIso}（应 ${row.firstObsMonth}，列可能取错）`);
        errors++;
      }

      if (last) {
        const monthsBehind =
          (Date.now() - last.obsDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        if (monthsBehind > MAX_STALE_MONTHS) {
          console.error(
            `  ✗ ${code}：最新观测 ${last.obsDate.toISOString().slice(0, 10)} 已落后 ${monthsBehind.toFixed(0)} 个月（阈值 ${MAX_STALE_MONTHS}）`,
          );
          errors++;
        }
      }

      const [lo, hi] = row.valueRange;
      const bad = await prisma.macroObservation.count({
        where: { instrumentId: inst.id, OR: [{ value: { lt: lo } }, { value: { gt: hi } }] },
      });
      if (bad > 0) {
        console.error(`  ✗ ${code}：${bad} 条观测值超出 [${lo},${hi}]`);
        errors++;
      }

      console.log(
        `  ✓ ${code}：${count} 条 · ${firstIso}(${first?.value}) → ${last?.obsDate.toISOString().slice(0, 7)}(${last?.value}) · ${acq?.status} · ${(sub?.releaseRule as { type?: string })?.type}`,
      );
    }
  } catch (e) {
    console.error(`  ✗ DB: ${e instanceof Error ? e.message : e}`);
    errors++;
  } finally {
    await prisma.$disconnect();
  }

  if (errors > 0) {
    console.error(`[verify-ritter-ipo] 失败：${errors} 项`);
    process.exit(1);
  }
  console.log("[verify-ritter-ipo] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

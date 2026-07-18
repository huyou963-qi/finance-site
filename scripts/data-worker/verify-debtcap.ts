/**
 * debtcap（BIS 杠杆率 / 偿债率）自检
 *
 * npm run data:verify-debtcap
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  PHASE2_DEBTCAP_BIS_CODES,
  bisSourceSeriesKeyForDebtcapCode,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/**
 * 最新观测阈值：当前日 − 12 个月。
 *
 * 两层滞后叠加，不能按"季初 − 1 个季度"卡：
 *   1) obs_date 记的是季初（2025-Q4 → 2025-10-01），本身比该季度实际结束早 3 个月；
 *   2) BIS 总信贷/偿债率约在季度结束后 4~6 个月才发布。
 * 合计正常滞后可达 9~10 个月，取 12 个月留出余量——超过一年没更新才算真的停更。
 */
function obsCutoff(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1));
}

/** 季初口径：obs_date 的月份必须是 1/4/7/10 且为当月 1 日 */
function isQuarterStart(d: Date): boolean {
  return d.getUTCDate() === 1 && [0, 3, 6, 9].includes(d.getUTCMonth());
}

const MIN_OBS = 60;

async function main() {
  let errors = 0;
  const cutoff = obsCutoff();
  console.log(
    `[verify-debtcap] ${PHASE2_DEBTCAP_BIS_CODES.length} 条指标；` +
      `最新观测阈值 ≥ ${cutoff.toISOString().slice(0, 10)}，最少 ${MIN_OBS} 条\n`,
  );

  for (const code of PHASE2_DEBTCAP_BIS_CODES) {
    const expectKey = bisSourceSeriesKeyForDebtcapCode(code);
    const inst = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true, freqLabel: true, unit: true },
    });
    if (!inst) {
      console.error(`✗ ${code} Instrument 未入库`);
      errors++;
      continue;
    }

    const problems: string[] = [];

    if (inst.freqLabel !== "季度") problems.push(`freqLabel=${inst.freqLabel}`);
    if (inst.unit !== "%") problems.push(`unit=${inst.unit}`);

    const sub = await prisma.dataSubscription.findUnique({
      where: { instrumentId: inst.id },
      select: {
        enabled: true,
        sourceId: true,
        sourceSeriesKey: true,
        granularity: true,
        releasePackageId: true,
      },
    });
    if (!sub) {
      problems.push("无订阅");
    } else {
      if (!sub.enabled) problems.push("订阅未启用");
      if (sub.sourceId !== "bis") problems.push(`sourceId=${sub.sourceId}`);
      if (sub.granularity !== "QUARTERLY") problems.push(`granularity=${sub.granularity}`);
      if (sub.sourceSeriesKey !== expectKey) {
        problems.push(`序列键=${sub.sourceSeriesKey} 期望=${expectKey}`);
      }
      if (!sub.releasePackageId) problems.push("未归入发布包");
    }

    const agg = await prisma.macroObservation.aggregate({
      where: { instrumentId: inst.id },
      _count: { _all: true },
      _max: { obsDate: true },
    });
    const n = agg._count._all;
    const latest = agg._max.obsDate;

    if (n < MIN_OBS) problems.push(`观测仅 ${n} 条`);
    if (!latest) {
      problems.push("无观测");
    } else if (latest < cutoff) {
      problems.push(`最新观测 ${latest.toISOString().slice(0, 10)} 过旧`);
    }

    // 季初口径统一性：混入季末日期说明 xlsx 遗留行未清干净
    const offGrid = await prisma.macroObservation.findMany({
      where: { instrumentId: inst.id },
      select: { obsDate: true },
    });
    const bad = offGrid.filter((o) => !isQuarterStart(o.obsDate));
    if (bad.length > 0) {
      problems.push(
        `${bad.length} 条非季初日期（如 ${bad
          .slice(0, 3)
          .map((b) => b.obsDate.toISOString().slice(0, 10))
          .join(",")}）`,
      );
    }

    if (problems.length > 0) {
      console.error(`✗ ${code}: ${problems.join("；")}`);
      errors++;
    } else {
      console.log(
        `✓ ${code.padEnd(48)} ${expectKey?.padEnd(22)} ${String(n).padStart(4)} 条 ` +
          `末 ${latest!.toISOString().slice(0, 10)}`,
      );
    }
  }

  // 居民 / 非金融企业不得是同一条序列（历史 bug：两者都取了私营部门合计）
  console.log("\n[verify-debtcap] 分部门序列区分度");
  for (const cc of ["us", "jp", "cn", "de"]) {
    const hh = await prisma.instrument.findUnique({
      where: { code: `debtcap_${cc}_leverage_household` },
      select: { id: true },
    });
    const nfc = await prisma.instrument.findUnique({
      where: { code: `debtcap_${cc}_leverage_non_financial_corporate` },
      select: { id: true },
    });
    if (!hh || !nfc) continue;

    const [hhLast] = await prisma.macroObservation.findMany({
      where: { instrumentId: hh.id },
      orderBy: { obsDate: "desc" },
      take: 1,
    });
    const [nfcLast] = await prisma.macroObservation.findMany({
      where: { instrumentId: nfc.id },
      orderBy: { obsDate: "desc" },
      take: 1,
    });
    if (hhLast && nfcLast && hhLast.value === nfcLast.value) {
      console.error(
        `  ✗ ${cc} 居民与非金融企业杠杆率末值相同（${hhLast.value}）——疑似又取到私营部门合计`,
      );
      errors++;
    } else {
      console.log(`  ✓ ${cc} 居民 ${hhLast?.value} ≠ 非金融企业 ${nfcLast?.value}`);
    }
  }

  console.log(`\n[verify-debtcap] ${errors === 0 ? "全部通过" : `${errors} 项失败`}`);
  if (errors > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

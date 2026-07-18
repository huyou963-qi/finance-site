/**
 * debtcap 全量重拉：清空既有观测，从 BIS 官方 API 重新落全历史。
 *
 * 背景：历史上 debtcap 观测由两条来源混写——
 *   1) xlsx 导入用「季末」日期（2025-03-01 = Q1）；
 *   2) BIS API 适配器用「季初」日期（2025-04-01 = Q2）。
 * 两套口径在同一 instrument 上共存，同一季度出现两行；且 leverage 类指标
 * 曾错误映射到 WS_CREDIT_GAP 的 Q.{国家}.P.A.A（私营非金融部门合计），
 * 导致居民/非金融企业两条杠杆率被写成同一个合计值。
 *
 * 本脚本统一到季初口径（与 FRED 季频序列一致），并按修正后的 WS_TC / WS_DSR
 * 序列键重新回填。
 *
 * npm run data:refetch-debtcap -- --dry-run
 * npm run data:refetch-debtcap
 * npm run data:refetch-debtcap -- --codes=debtcap_us_leverage_household
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { fetchBisIncremental } from "../../src/lib/data/scheduler/adapters/bisAdapter";
import {
  PHASE2_DEBTCAP_BIS_CODES,
  bisSourceSeriesKeyForDebtcapCode,
} from "../../src/lib/data/scheduler/phase2SeedCatalog";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** BIS 最早的 debtcap 序列是美国 1947-Q4，取更早的下界确保不截断 */
const FULL_HISTORY_START = "1940-01-01";
const BIS_MIN_INTERVAL_MS = 1300;

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dryRun = argFlag("dry-run");
  const only = argValue("codes")?.split(",").map((s) => s.trim()).filter(Boolean);
  const codes = only?.length ? only : [...PHASE2_DEBTCAP_BIS_CODES];

  console.log(
    `[refetch-debtcap] ${codes.length} 条指标，${dryRun ? "DRY RUN（不写库）" : "写库"}\n`,
  );

  let ok = 0;
  let failed = 0;
  const summary: string[] = [];

  for (const code of codes) {
    const seriesKey = bisSourceSeriesKeyForDebtcapCode(code);
    if (!seriesKey) {
      console.log(`✗ ${code} 无 BIS 序列映射，跳过`);
      failed++;
      continue;
    }

    const inst = await prisma.instrument.findUnique({
      where: { code },
      select: { id: true, name: true },
    });
    if (!inst) {
      console.log(`✗ ${code} Instrument 未入库，跳过`);
      failed++;
      continue;
    }

    const before = await prisma.macroObservation.aggregate({
      where: { instrumentId: inst.id },
      _count: { _all: true },
      _min: { obsDate: true },
      _max: { obsDate: true },
    });

    let points;
    try {
      await sleep(BIS_MIN_INTERVAL_MS);
      const res = await fetchBisIncremental(seriesKey, FULL_HISTORY_START);
      points = res.points;
    } catch (e) {
      console.log(`✗ ${code} 拉取失败: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
      continue;
    }

    if (points.length === 0) {
      console.log(`✗ ${code} ${seriesKey} 返回 0 条观测，保留原数据不动`);
      failed++;
      continue;
    }

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const line =
      `${code.padEnd(48)} ${seriesKey.padEnd(22)} ` +
      `${String(before._count._all).padStart(4)} → ${String(points.length).padStart(4)} 条  ` +
      `${iso(first.obsDate)} ~ ${iso(last.obsDate)} (末值 ${last.value})`;

    if (dryRun) {
      console.log(`· ${line}`);
      console.log(
        `    原区间 ${before._min.obsDate ? iso(before._min.obsDate) : "-"} ~ ` +
          `${before._max.obsDate ? iso(before._max.obsDate) : "-"}`,
      );
      summary.push(line);
      ok++;
      continue;
    }

    await prisma.$transaction([
      prisma.macroObservation.deleteMany({ where: { instrumentId: inst.id } }),
      prisma.macroObservation.createMany({
        data: points.map((p) => ({
          instrumentId: inst.id,
          obsDate: p.obsDate,
          value: p.value,
        })),
      }),
      prisma.dataSubscription.updateMany({
        where: { instrumentId: inst.id },
        data: { lastObsDate: last.obsDate, lastSuccessAt: new Date(), lastError: null },
      }),
    ]);

    console.log(`✓ ${line}`);
    summary.push(line);
    ok++;
  }

  console.log(`\n[refetch-debtcap] 成功 ${ok}，失败 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

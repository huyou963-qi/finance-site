/**
 * data:backfill-empty — 为「有订阅但零观测」的指标强制回填历史。
 *
 * 为什么需要它（而非 sync-all-stale）：新 seed 的序列 nextRunAt 被设到未来
 * （日频=次日），更新状态是 on_schedule 而非 stale，`sync-all-stale` 不会碰它们；
 * 而 worker 要等到 nextRunAt 才拉。部署后若想让新指标立刻有数据（图表可见、verify
 * 通过），需按「观测为空」精准强制拉取——这正是本脚本。
 *
 * 幂等 + cheap：只选零观测且 acquisition=ready 的订阅，force 拉一次；有数据后不再命中，
 * 稳态下零开销。data:apply 默认在 verify 前调用它。
 *
 * npm run data:backfill-empty
 * npm run data:backfill-empty -- --dry-run --limit=50
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { resolveAcquisitionStatus } from "../../src/lib/data/scheduler/catalogAcquisition";
import { runDataSubscription, type SubscriptionWithRelations } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

const SUBSCRIPTION_INCLUDE = {
  source: true,
  instrument: { select: { id: true, code: true, name: true, metadata: true } },
  releasePackage: {
    select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true },
  },
} as const;

async function main() {
  const dryRun = argFlag("dry-run");
  const limit = Number(argValue("limit") ?? "500");

  const subs = (await prisma.dataSubscription.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { instrument: { code: "asc" } }],
    include: SUBSCRIPTION_INCLUDE,
  })) as unknown as SubscriptionWithRelations[];

  // 哪些 instrument 已有观测（只查候选，走 instrumentId 索引，避免全表扫）
  const instIds = subs.map((s) => s.instrument.id);
  const withObs = await prisma.macroObservation.findMany({
    where: { instrumentId: { in: instIds } },
    distinct: ["instrumentId"],
    select: { instrumentId: true },
  });
  const hasObs = new Set(withObs.map((o) => o.instrumentId));

  // 零观测 + 获取方式 ready（排除 MANUAL/未确认，force 也拉不动它们）
  const candidates = subs.filter((sub) => {
    if (hasObs.has(sub.instrument.id)) return false;
    const acq = resolveAcquisitionStatus({
      subscriptionEnabled: sub.enabled,
      adapterKind: sub.source.adapterKind,
      sourceSeriesKey: sub.sourceSeriesKey,
      metadata: sub.instrument.metadata,
    });
    return acq === "ready";
  });

  const targets = candidates.slice(0, limit);
  console.log(
    `[data:backfill-empty] ${dryRun ? "dry-run " : ""}零观测且 ready 的订阅 ${candidates.length} 条` +
      `${candidates.length > limit ? `（本轮取前 ${limit}）` : ""}`,
  );

  if (targets.length === 0) {
    console.log("[data:backfill-empty] 无需回填（所有 ready 指标均已有观测）");
    return;
  }

  if (dryRun) {
    for (const s of targets) console.log(`  · ${s.instrument.code}`);
    console.log(`[data:backfill-empty] dry-run：未执行`);
    return;
  }

  let success = 0;
  let failed = 0;
  for (const sub of targets) {
    try {
      const r = await runDataSubscription(prisma, sub, { force: true });
      if (r.status === "failed") {
        failed++;
        console.error(`  ✗ ${sub.instrument.code} | ${r.error ?? "失败"}`);
      } else {
        success++;
        console.log(`  ✓ ${sub.instrument.code} +${r.rowsUpserted}`);
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${sub.instrument.code} | ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`[data:backfill-empty] 完成：成功 ${success}，失败 ${failed}，剩余未处理 ${candidates.length - targets.length}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

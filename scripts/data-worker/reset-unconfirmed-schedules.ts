/**
 * 清除「获取方式未确认」订阅的 nextRunAt（与 sync-calendar 行为一致）
 *
 * npm run data:reset-unconfirmed-schedules -- --apply
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { subscriptionEligibleForSchedule } from "../../src/lib/data/scheduler/subscriptionEligibility";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const subs = await prisma.dataSubscription.findMany({
    where: { enabled: true, nextRunAt: { not: null } },
    include: {
      source: { select: { adapterKind: true } },
      instrument: { select: { code: true, metadata: true } },
    },
  });

  let hit = 0;
  for (const sub of subs) {
    if (
      subscriptionEligibleForSchedule({
        subscriptionEnabled: sub.enabled,
        adapterKind: sub.source.adapterKind,
        sourceSeriesKey: sub.sourceSeriesKey,
        metadata: sub.instrument.metadata,
      })
    ) {
      continue;
    }
    hit += 1;
    console.log(`  ${sub.instrument.code}`);
    if (apply) {
      await prisma.dataSubscription.update({
        where: { id: sub.id },
        data: { nextRunAt: null },
      });
    }
  }

  console.log(
    `[reset-unconfirmed-schedules] ${hit} 条未确认获取${apply ? "已" : "将"}清空 nextRunAt${apply ? "" : "（加 --apply）"}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

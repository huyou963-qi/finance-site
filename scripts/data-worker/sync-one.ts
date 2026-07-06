/**
 * 强制同步单条序列
 *
 * npm run data:sync-one -- sched_fred_CPIAUCSL
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  const code = process.argv[2]?.trim();
  if (!code) {
    console.error("用法: npm run data:sync-one -- <instrument_code>");
    process.exit(1);
  }

  const sub = await prisma.dataSubscription.findFirst({
    where: { instrument: { code } },
    include: {
      source: true,
      // metadata 必选：抓取型 provider（TE/NY Fed 等）的分发依赖 instrument.metadata.scrape，
      // 缺失会误落到默认适配器（BIS）
      instrument: { select: { id: true, code: true, name: true, metadata: true } },
      releasePackage: {
        select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true },
      },
    },
  });

  if (!sub) {
    console.error(`未找到订阅: ${code}`);
    process.exit(1);
  }

  console.log(`[data:sync-one] ${sub.instrument.name} (${code})`);
  const result = await runDataSubscription(prisma, sub, { force: true });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

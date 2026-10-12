import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { runDataSubscription, type SubscriptionWithRelations } from "../runSubscription";
import { recordScheduleChange } from "../schedulerAudit";
import type { SubscriptionRunResult } from "../types";
import { fetchSafeExternalHistory } from "./client";
import { SAFE_DATASETS, type SafeDataset } from "./catalog";

export function safeDatasetForSubscription(sub: SubscriptionWithRelations): SafeDataset {
  const metadata = sub.instrument.metadata as { scrape?: { provider?: string; dataset?: string } } | null;
  const key = metadata?.scrape?.dataset;
  if (sub.sourceId !== "safe-external" || metadata?.scrape?.provider !== "safe_external" ||
      !SAFE_DATASETS.some((dataset) => dataset.key === key)) {
    throw new Error(`SAFE 成员数据集未确认：${sub.instrument.code}`);
  }
  return key as SafeDataset;
}

/** 下载/解析按数据集共享；沿用逐成员的幂等写入、版本账本和 fetch_run。 */
export async function syncSafePackage(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  options: {
    force?: boolean;
    loadHistory?: typeof fetchSafeExternalHistory;
    runMember?: typeof runDataSubscription;
    onMember?: (sub: SubscriptionWithRelations, result: SubscriptionRunResult) => void;
  } = {},
) {
  const packageId = subs[0]?.releasePackageId;
  if (!packageId || subs.some((sub) => sub.releasePackageId !== packageId)) {
    throw new Error("SAFE 批量执行必须属于同一发布包");
  }
  const packageSyncId = randomUUID();
  const snapshots = new Map<SafeDataset, ReturnType<typeof fetchSafeExternalHistory>>();
  const results: Array<{ sub: SubscriptionWithRelations; result: SubscriptionRunResult }> = [];
  for (const sub of subs) {
    const result = await (options.runMember ?? runDataSubscription)(prisma, sub, {
      force: options.force,
      deferPackageSchedule: true,
      fetchIncremental: async (fetchStart) => {
        const dataset = safeDatasetForSubscription(sub);
        let snapshot = snapshots.get(dataset);
        if (!snapshot) {
          snapshot = (options.loadHistory ?? fetchSafeExternalHistory)({ datasets: [dataset] });
          snapshots.set(dataset, snapshot);
        }
        const series = (await snapshot).get(sub.instrument.code);
        if (!series?.points.length) throw new Error(`SAFE 官方工作簿缺少成员：${sub.instrument.code}`);
        return {
          points: series.points.filter((point) => point.obsDate >= new Date(`${fetchStart}T00:00:00Z`)),
          sourceLatestObsDate: series.points.at(-1)!.obsDate,
          skippedInvalid: 0,
        };
      },
    });
    results.push({ sub, result });
    options.onMember?.(sub, result);
  }
  // 未处理的成员（中断、被过滤或新增）仍在原到期时间。取最早排期保证它们不漏更；
  // 失败成员的退避排期也参与计算，而不是用某个成功成员推进整包。
  const next = await prisma.dataSubscription.findFirst({
    where: { releasePackageId: packageId, enabled: true },
    orderBy: { nextRunAt: "asc" },
    select: { nextRunAt: true },
  });
  if (next?.nextRunAt) {
    const previous = await prisma.releasePackage.findUnique({ where: { id: packageId }, select: { nextRunAt: true } });
    await prisma.$transaction([
      prisma.releasePackage.update({ where: { id: packageId }, data: { nextRunAt: next.nextRunAt } }),
      prisma.dataSubscription.updateMany({ where: { releasePackageId: packageId, enabled: true }, data: { nextRunAt: next.nextRunAt } }),
    ]);
    await recordScheduleChange(prisma, {
      releasePackageId: packageId,
      previousNextRunAt: previous?.nextRunAt,
      nextRunAt: next.nextRunAt,
      source: "data_worker",
      reason: "safe_package_completed",
      metadata: { packageSyncId, members: results.length, failed: results.filter(({ result }) => result.status === "failed").length },
    });
  }
  return results;
}

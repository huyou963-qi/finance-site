import type { PrismaClient } from "@prisma/client";
import { parseReleaseRule } from "./releaseRule";
import type { PackageRunState } from "./packageScheduleGuard";

/**
 * 读取每个发布包的「跑没跑过 / 消费没消费」状态，供 `packageScheduleGuard` 判定。
 *
 * 发布包本身不记 lastSuccessAt，只有成员订阅记；包是原子工作单元，所以取成员的
 * 最小值才能代表全包，任一成员成功不能替失败成员消费本期。
 * `sourceSync` 存在成员 releaseRule JSON 里（由
 * `runSubscription` 在确认「本地 obsDate == 源端 obsDate」时写入）。
 */
export async function loadPackageRunStates(
  prisma: PrismaClient,
): Promise<Map<string, PackageRunState>> {
  const rows = await prisma.dataSubscription.findMany({
    where: { releasePackageId: { not: null }, enabled: true },
    select: { releasePackageId: true, lastSuccessAt: true, lastError: true, releaseRule: true },
  });

  const map = new Map<string, PackageRunState>();
  for (const row of rows) {
    const packageId = row.releasePackageId;
    if (!packageId) continue;
    const verifiedAt = sourceVerifiedAtFromRule(row.releaseRule);
    const previous = map.get(packageId);
    const min = (a: Date | null, b: Date | null) => a && b ? a < b ? a : b : null;
    const state: PackageRunState = previous ? {
      lastSuccessAt: min(previous.lastSuccessAt, row.lastSuccessAt),
      sourceVerifiedAt: min(previous.sourceVerifiedAt, verifiedAt),
      hasUnresolvedFailures: previous.hasUnresolvedFailures || Boolean(row.lastError),
    } : { lastSuccessAt: row.lastSuccessAt, sourceVerifiedAt: verifiedAt, hasUnresolvedFailures: Boolean(row.lastError) };
    map.set(packageId, state);
  }
  return map;
}

function sourceVerifiedAtFromRule(raw: unknown): Date | null {
  const rule = parseReleaseRule(raw);
  if (rule.type !== "economic_calendar") return null;
  const sourceSync = rule.sourceSync;
  if (!sourceSync || sourceSync.status !== "current") return null;
  const at = new Date(sourceSync.verifiedAt);
  return Number.isNaN(at.getTime()) ? null : at;
}

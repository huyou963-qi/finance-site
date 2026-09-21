/**
 * seed 不得推迟已排好的探测（2026-09-21）。
 *
 * 54 个 seed-*.ts 的 dataSubscription.upsert 在 update 分支里都写了
 * `nextRunAt: computeNextRunAt(rule, new Date())`——每次部署（data:apply 会跑全部 seed）都把
 * probe_interval 订阅的下次探测重设为「现在 + 间隔」。部署比间隔频繁时这些订阅**永远到不了期**：
 * 实测 186 条饿死，BIS 22 条自 08-31 起未跑、Ritter IPO / FINRA 融资余额从未跑过。
 *
 * 集中在 data:seed 入口兜底：seed 前后各取一次快照，规则与启用状态都没变、却被往后推的
 * probe_interval 订阅恢复原 nextRunAt。只管 probe_interval：日历型规则由 data:sync-calendar
 * 管，个别 seed 还会刻意写入精确的官方发布时刻（如 BOJ 资金循环），不能改回。
 */
export type SubscriptionScheduleSnapshot = {
  id: string;
  nextRunAt: Date | null;
  releaseRule: unknown;
  enabled: boolean;
};

function isProbeInterval(rule: unknown): boolean {
  return Boolean(rule) && typeof rule === "object" && (rule as { type?: unknown }).type === "probe_interval";
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 返回需要恢复的订阅（id → seed 之前的 nextRunAt）。
 * 之前为 null（= 立即到期，手工补数常用）而 seed 写成未来时间，同样算推迟。
 */
export function findDelayedProbeSchedules(
  before: readonly SubscriptionScheduleSnapshot[],
  after: readonly SubscriptionScheduleSnapshot[],
): Array<{ id: string; restoreTo: Date | null; delayedTo: Date }> {
  const prev = new Map(before.map((row) => [row.id, row]));
  const out: Array<{ id: string; restoreTo: Date | null; delayedTo: Date }> = [];
  for (const row of after) {
    const old = prev.get(row.id);
    if (!old || !row.nextRunAt) continue;
    if (!isProbeInterval(row.releaseRule) || !sameJson(old.releaseRule, row.releaseRule)) continue;
    if (old.enabled !== row.enabled) continue;
    if (old.nextRunAt && row.nextRunAt.getTime() <= old.nextRunAt.getTime()) continue;
    out.push({ id: row.id, restoreTo: old.nextRunAt, delayedTo: row.nextRunAt });
  }
  return out;
}

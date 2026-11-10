/**
 * 「源端待补齐」：一个发布包已经发出本期，但某个成员在源端还没有本期数据
 * （例如国家统计局月报只列部分行业，其余行业要等国家数据网站补齐）。
 *
 * 它仍是该成员的失败：不报告"无变化"，发布包不算消费本期，照常退避重试。
 * 区别只在于它不是源站故障，所以：
 * - worker 不因它中止同包其余成员（其余成员的本期数据照常写库）；
 * - 新鲜度体检在宽限期内记为 warning，过期仍未补齐才升为 critical。
 *
 * 标记写在错误消息里，因为 runSubscription 只把消息串存进 lastError。
 */
const PREFIX = "[source_pending until=";
const PATTERN = /^\[source_pending until=(\d{4}-\d{2}-\d{2})\] /;

export class SourcePendingError extends Error {
  constructor(message: string, until: Date) {
    super(`${PREFIX}${until.toISOString().slice(0, 10)}] ${message}`);
    this.name = "SourcePendingError";
  }
}

/** 返回宽限截止日（UTC 当天结束前有效）；不是待补齐错误时返回 null。 */
export function sourcePendingUntil(message: string | null | undefined): Date | null {
  const match = message ? PATTERN.exec(message) : null;
  if (!match) return null;
  const until = new Date(`${match[1]}T23:59:59.999Z`);
  return Number.isNaN(until.getTime()) ? null : until;
}

export function isSourcePending(message: string | null | undefined): boolean {
  return sourcePendingUntil(message) !== null;
}

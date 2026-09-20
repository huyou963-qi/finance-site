/**
 * 发布包 nextRunAt 护栏：日历同步**不得**把一次该跑而没跑的任务往后推。
 *
 * 背景（2026-09 生产事故）：`applyCalendarMatchToPackage()` 原先无条件用
 * 「下一次发布时刻」覆写 `release_package.nextRunAt`，而匹配函数只看未来事件。
 * 日历源投递一旦抖动，每小时的 sync-calendar 就会在「本月发布日 ↔ 下月发布日」
 * 之间来回翻；`mds.schedule_audit_event` 实证 us.census.mtis 在
 * 2026-09-16 22:00:06 把 nextRunAt 从 22:03（还差 3 分钟就该跑）改成了
 * 10-15 22:03，于是整月数据丢失，而且**永不补抓**——日历型规则的 fallback
 * 只在 calendarMatch 缺失时才生效。BUSINV / BOPGSTB 等 15 条因此落后 2-3 个月。
 *
 * 这里是纯函数，不碰 IO，便于单测覆盖上面那个时序。
 */

export type PackageRunState = {
  /** 包内成员最近一次成功执行时间（含 SKIPPED，只表示「跑过」） */
  lastSuccessAt: Date | null;
  /**
   * 包内成员最近一次确认「本地已追上源端」的时间
   * （成员 releaseRule.sourceSync.status === "current" 的 verifiedAt 最大值）。
   * 用来区分「跑过但源端还没出数」和「这一期真的消费完了」。
   */
  sourceVerifiedAt: Date | null;
};

export type PackageScheduleDecision = {
  nextRunAt: Date | null;
  /**
   * - `calendar`：正常采用日历算出的下一次发布时刻
   * - `hold_due_run`：现有 nextRunAt 已到期/临近，拒绝往后推
   * - `hold_pending_release`：上一期发布已过但尚未消费，保持现有探测点
   * - `catch_up_missed_release`：上一期发布已过且那之后没跑过，立即补抓
   */
  reason:
    | "calendar"
    | "hold_due_run"
    | "hold_pending_release"
    | "catch_up_missed_release";
};

const DEFAULT_GRACE_MINUTES = 30;

function graceMinutes(override?: number): number {
  if (override != null && Number.isFinite(override) && override >= 0) return override;
  const raw = process.env.CALENDAR_HOLD_GRACE_MINUTES?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_GRACE_MINUTES;
}

/** 上一期发布是否已被消费：在它之后确认过「本地 == 源端」。 */
export function releaseConsumed(
  runState: PackageRunState,
  previousReleaseAt: Date,
): boolean {
  const verified = runState.sourceVerifiedAt;
  if (verified) return verified.getTime() >= previousReleaseAt.getTime();
  // 包内没有任何成员写过 sourceSync（例如刚接入的源）时退化为「跑过就算数」，
  // 否则会永远停在 hold_pending_release 每 N 小时空转。
  const ran = runState.lastSuccessAt;
  return ran != null && ran.getTime() >= previousReleaseAt.getTime();
}

/**
 * 决定发布包这一轮日历同步后的 nextRunAt。
 *
 * 判定顺序（先到先得）：
 * 1. 已知上一期发布且已过：
 *    a. 那之后压根没跑过 → 立刻补抓；
 *    b. 跑过但还没确认追上源端 → 保持现有探测点，不跳到下一期；
 *    c. 已确认消费 → 这一期的活干完了，放心跟随日历。
 * 2. 上一期发布未知（TE 给不出，或首次同步）：现有 nextRunAt 已到期或在宽限期内
 *    而日历算出来的更晚 → 保持现有，兜住「马上要跑却被推走」。
 * 3. 其余情况采用日历结果。
 *
 * 注意 1c 必须早于 2：否则一次「发布后 +2h 的冗余探测点」会被 2 永久保留，
 * 把包钉死在上一期。
 */
export function resolvePackageNextRunAt(params: {
  computedNextRunAt: Date | null;
  currentNextRunAt: Date | null;
  previousReleaseAt: Date | null;
  runState: PackageRunState;
  now: Date;
  graceMinutes?: number;
}): PackageScheduleDecision {
  const {
    computedNextRunAt,
    currentNextRunAt,
    previousReleaseAt,
    runState,
    now,
  } = params;

  const nowMs = now.getTime();

  if (previousReleaseAt && previousReleaseAt.getTime() <= nowMs) {
    if (releaseConsumed(runState, previousReleaseAt)) {
      // 1c：上一期已确认消费，现有 nextRunAt 只是发布后的冗余探测点，
      // 放心跟随日历；否则会被下面的 hold_due_run 永久钉在上一期。
      return { nextRunAt: computedNextRunAt, reason: "calendar" };
    }

    const ranAfterRelease =
      runState.lastSuccessAt != null &&
      runState.lastSuccessAt.getTime() >= previousReleaseAt.getTime();

    if (!ranAfterRelease) {
      // 1a：发布日过去了却一次都没跑 —— 正是本次事故的形态，立即补。
      return { nextRunAt: now, reason: "catch_up_missed_release" };
    }
    // 1b：跑过但源端当时还没出数，保持既有的发布后探测节奏。
    if (
      currentNextRunAt &&
      (!computedNextRunAt || currentNextRunAt.getTime() < computedNextRunAt.getTime())
    ) {
      return { nextRunAt: currentNextRunAt, reason: "hold_pending_release" };
    }
  }

  if (currentNextRunAt && computedNextRunAt) {
    const dueCutoff = nowMs + graceMinutes(params.graceMinutes) * 60_000;
    if (
      currentNextRunAt.getTime() <= dueCutoff &&
      computedNextRunAt.getTime() > currentNextRunAt.getTime()
    ) {
      return { nextRunAt: currentNextRunAt, reason: "hold_due_run" };
    }
  }

  return { nextRunAt: computedNextRunAt, reason: "calendar" };
}

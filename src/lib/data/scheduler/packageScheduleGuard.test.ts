import assert from "node:assert/strict";
import { test } from "node:test";
import {
  releaseConsumed,
  resolvePackageNextRunAt,
  type PackageRunState,
} from "./packageScheduleGuard";

const NONE: PackageRunState = { lastSuccessAt: null, sourceVerifiedAt: null };
const d = (iso: string) => new Date(iso);

test("复刻 us.census.mtis 2026-09-16 事故：这一期没抓到就不许跳到下个月", () => {
  // 生产审计记录：22:00:06 这一轮把 nextRunAt 从 22:03 改成了 10-15 22:03，
  // 而上次成功执行停在 2026-07-09 —— 8 月、9 月两期全丢。
  const now = d("2026-09-16T22:00:06.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T22:03:00.000Z"),
    currentNextRunAt: d("2026-09-16T22:03:00.000Z"),
    // 上一轮匹配的这一期刚刚（6 秒前）发生
    previousReleaseAt: d("2026-09-16T22:00:00.000Z"),
    runState: {
      lastSuccessAt: d("2026-07-09T05:59:15.000Z"),
      sourceVerifiedAt: d("2026-07-09T05:59:15.000Z"),
    },
    now,
  });
  assert.equal(decision.reason, "catch_up_missed_release");
  assert.equal(decision.nextRunAt?.toISOString(), now.toISOString());
});

test("上一期发布时刻未知（TE 给不出）时，宽限期内的到期任务仍被兜住", () => {
  const now = d("2026-09-16T22:00:06.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T22:03:00.000Z"),
    currentNextRunAt: d("2026-09-16T22:03:00.000Z"),
    previousReleaseAt: null,
    runState: {
      lastSuccessAt: d("2026-07-09T05:59:15.000Z"),
      sourceVerifiedAt: d("2026-07-09T05:59:15.000Z"),
    },
    now,
  });
  assert.equal(decision.reason, "hold_due_run");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-09-16T22:03:00.000Z");
});

test("发布日已过且那之后一次都没跑过 → 立即补抓", () => {
  const now = d("2026-09-20T09:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: d("2026-10-15T12:30:00.000Z"),
    previousReleaseAt: d("2026-09-16T12:30:00.000Z"),
    runState: {
      lastSuccessAt: d("2026-07-09T05:59:00.000Z"), // 停在 7 月，整整漏掉 8/9 两期
      sourceVerifiedAt: d("2026-07-09T05:59:00.000Z"),
    },
    now,
  });
  assert.equal(decision.reason, "catch_up_missed_release");
  assert.equal(decision.nextRunAt?.toISOString(), now.toISOString());
});

test("跑过但源端当时还没出数 → 保持发布后探测节奏，不跳到下一期", () => {
  const now = d("2026-09-16T14:30:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: d("2026-09-16T16:05:00.000Z"), // runSubscription 排的 +2h 探测
    previousReleaseAt: d("2026-09-16T12:30:00.000Z"),
    runState: {
      lastSuccessAt: d("2026-09-16T12:33:00.000Z"), // 跑了
      sourceVerifiedAt: d("2026-09-10T00:00:00.000Z"), // 但确认「追上源端」还停在上一期
    },
    now,
  });
  assert.equal(decision.reason, "hold_pending_release");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-09-16T16:05:00.000Z");
});

test("消费完这一期后，发布后的冗余探测点不会把包钉死（回归：hold_due_run 不得越过 1c）", () => {
  const now = d("2026-09-16T15:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: d("2026-09-16T14:33:00.000Z"), // 已到期的 +2h 探测点
    previousReleaseAt: d("2026-09-16T12:30:00.000Z"),
    runState: {
      lastSuccessAt: d("2026-09-16T12:33:00.000Z"),
      sourceVerifiedAt: d("2026-09-16T12:33:10.000Z"),
    },
    now,
  });
  assert.equal(decision.reason, "calendar");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-10-15T12:30:00.000Z");
});

test("日历把排期提前是允许的（只拦往后推）", () => {
  const now = d("2026-09-20T09:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-09-20T09:10:00.000Z"),
    currentNextRunAt: d("2026-09-20T09:05:00.000Z"),
    previousReleaseAt: null,
    runState: NONE,
    now,
    graceMinutes: 30,
  });
  // 现有的更早 → 保持现有，绝不往后挪
  assert.equal(decision.reason, "hold_due_run");

  const earlier = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-09-20T09:02:00.000Z"),
    currentNextRunAt: d("2026-09-20T09:25:00.000Z"),
    previousReleaseAt: null,
    runState: NONE,
    now,
    graceMinutes: 30,
  });
  assert.equal(earlier.reason, "calendar");
  assert.equal(earlier.nextRunAt?.toISOString(), "2026-09-20T09:02:00.000Z");
});

test("宽限期之外的正常排期照常跟随日历", () => {
  const now = d("2026-09-20T09:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: d("2026-09-25T12:30:00.000Z"), // 还早，不在宽限期内
    previousReleaseAt: d("2026-09-16T12:30:00.000Z"),
    runState: {
      lastSuccessAt: d("2026-09-16T12:33:00.000Z"),
      sourceVerifiedAt: d("2026-09-16T12:33:00.000Z"),
    },
    now,
    graceMinutes: 30,
  });
  assert.equal(decision.reason, "calendar");
});

test("从未跑过的新包不会被判成漏抓死循环", () => {
  const now = d("2026-09-20T09:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: null,
    previousReleaseAt: d("2026-09-16T12:30:00.000Z"),
    runState: NONE,
    now,
  });
  // 没跑过 + 发布日已过 ⇒ 补抓一次；补抓成功后 lastSuccessAt 前移，不会反复触发
  assert.equal(decision.reason, "catch_up_missed_release");
});

test("releaseConsumed：无 sourceSync 时退化为「跑过就算」", () => {
  const releaseAt = d("2026-09-16T12:30:00.000Z");
  assert.equal(
    releaseConsumed({ lastSuccessAt: d("2026-09-16T13:00:00.000Z"), sourceVerifiedAt: null }, releaseAt),
    true,
  );
  assert.equal(
    releaseConsumed({ lastSuccessAt: d("2026-09-15T13:00:00.000Z"), sourceVerifiedAt: null }, releaseAt),
    false,
  );
  // 有 sourceSync 时以它为准，跑过也不算消费
  assert.equal(
    releaseConsumed(
      { lastSuccessAt: d("2026-09-16T13:00:00.000Z"), sourceVerifiedAt: d("2026-09-01T00:00:00.000Z") },
      releaseAt,
    ),
    false,
  );
});

test("previousReleaseAt 为空（首次同步）时不触发任何 hold", () => {
  const now = d("2026-09-20T09:00:00.000Z");
  const decision = resolvePackageNextRunAt({
    computedNextRunAt: d("2026-10-15T12:30:00.000Z"),
    currentNextRunAt: null,
    previousReleaseAt: null,
    runState: NONE,
    now,
  });
  assert.equal(decision.reason, "calendar");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-10-15T12:30:00.000Z");
});

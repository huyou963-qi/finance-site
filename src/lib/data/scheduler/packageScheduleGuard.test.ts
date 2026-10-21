import assert from "node:assert/strict";
import { test } from "node:test";
import {
  releaseConsumed,
  resolvePackageNextRunAt,
  shouldFanOutCalendarSchedule,
  type PackageRunState,
} from "./packageScheduleGuard";

const NONE: PackageRunState = { lastSuccessAt: null, sourceVerifiedAt: null };
const d = (iso: string) => new Date(iso);

test("hourly calendar cannot overwrite independent Census acquisition backoffs", () => {
  assert.equal(shouldFanOutCalendarSchedule("us.census.international_trade", true), false);
  assert.equal(shouldFanOutCalendarSchedule("us.census.international_trade", false), true);
  assert.equal(shouldFanOutCalendarSchedule("cn.nbs.fixed-asset-investment", true), true);
});

test("FRED date-only mixed releases accept actual publication earlier than synthetic08:30", () => {
  const state: PackageRunState = { requiresPublicationProof: true, lastSuccessAt: d("2026-10-21T01:00Z"),
    sourceVerifiedAt: d("2026-10-01T20:16Z"), previousReleaseById: { 101: d("2026-10-20T12:30Z") },
    publicationRequirements: [
      { releaseId: 101, publishedAt: d("2026-10-20T12:01:28Z") },
      { releaseId: 18, monthlyLag: 1, observation: d("2026-09-01"), publishedAt: d("2026-10-01T20:16Z") },
    ] };
  assert.equal(releaseConsumed(state, d("2026-10-20T12:30Z")), true);
  state.publicationRequirements![0].publishedAt = d("2026-10-19T23:59:59Z");
  assert.equal(releaseConsumed(state, d("2026-10-20T12:30Z")), false);
});

test("October19 FAI empty fetch cannot skip September detail until November16", () => {
  const state: PackageRunState = { lastSuccessAt: d("2026-10-19T02:37Z"),
    sourceVerifiedAt: d("2026-10-19T02:37Z"),
    requiredMonthlyObservation: { oldest: d("2026-08-01"), lagMonths: 1 } };
  const params = { packageId: "cn.nbs.fixed-asset-investment", runState: state,
    previousReleaseAt: d("2026-10-19T02:00Z"), now: d("2026-10-21T01:00Z"),
    computedNextRunAt: d("2026-11-16T02:03Z"), currentNextRunAt: d("2026-11-16T02:03Z") };
  assert.equal(releaseConsumed(state, params.previousReleaseAt, params.packageId), false);
  assert.equal(resolvePackageNextRunAt(params).nextRunAt?.toISOString(), "2026-10-21T03:00:00.000Z");
  state.requiredMonthlyObservation!.oldest = d("2026-09-01");
  assert.equal(resolvePackageNextRunAt(params).nextRunAt, params.computedNextRunAt);
});

test("merged employment target gate cannot bypass FRED publication proof", () => {
  const release = d("2026-10-02T12:30:00Z");
  const state: PackageRunState = { requiresPublicationProof: true,
    lastSuccessAt: d("2026-10-02T14:00:00Z"), sourceVerifiedAt: null,
    requiredSeriesLatestObsDate: d("2026-09-01"),
    requiredMonthlyObservation: { oldest: d("2026-09-01"), lagMonths: 1 } };
  assert.equal(releaseConsumed(state, release, "us.bls.employment_situation"), false);
  state.sourceVerifiedAt = d("2026-10-02T14:00:00Z");
  assert.equal(releaseConsumed(state, release, "us.bls.employment_situation"), true);
});

test("monthly target proof allows ADP publication before conventional FRED calendar 08:30 time", () => {
  const state: PackageRunState = { requiresPublicationProof: true,
    requiredMonthlyObservation: { oldest: d("2026-09-01"), lagMonths: 1 },
    lastSuccessAt: d("2026-10-07T13:00:00Z"), sourceVerifiedAt: d("2026-10-07T12:16:00Z") };
  const release = d("2026-10-07T12:30:00Z");
  assert.equal(releaseConsumed(state, release), true);
  state.requiredMonthlyObservation!.oldest = d("2026-08-01");
  assert.equal(releaseConsumed(state, release), false);
});

test("multi-release FOMC/H15 package checks each member against its own release", () => {
  const state: PackageRunState = { requiresPublicationProof: true,
    lastSuccessAt: d("2026-10-20T21:00:00Z"), sourceVerifiedAt: d("2026-09-16T18:01:00Z"),
    previousReleaseById: { 18: d("2026-10-20T12:30:00Z"), 101: d("2026-09-16T12:30:00Z") },
    publicationRequirements: [
      { releaseId: 18, publishedAt: d("2026-10-20T20:00:00Z") },
      { releaseId: 101, publishedAt: d("2026-09-16T18:01:00Z") },
    ],
  };
  assert.equal(releaseConsumed(state, d("2026-10-20T12:30:00Z")), true);
  state.previousReleaseById = { ...state.previousReleaseById, 101: d("2026-10-21T18:00:00Z") };
  assert.equal(releaseConsumed(state, d("2026-10-21T18:00:00Z")), false);
  state.publicationRequirements![1].publishedAt = d("2026-10-21T18:15:00Z");
  assert.equal(releaseConsumed(state, d("2026-10-21T18:00:00Z")), true);
  state.publicationRequirements![1].releaseId = null;
  assert.equal(releaseConsumed(state, d("2026-10-21T18:00:00Z")), false);
});

test("monthly FEDFUNDS in daily H15 releases requires the completed month, not a daily republish", () => {
  const state: PackageRunState = { requiresPublicationProof: true,
    lastSuccessAt: d("2026-10-20T22:00:00Z"), sourceVerifiedAt: null,
    publicationRequirements: [{ releaseId: 18, monthlyLag: 1,
      observation: d("2026-09-01"), publishedAt: d("2026-10-01T20:00:00Z") }],
  };
  assert.equal(releaseConsumed(state, d("2026-10-20T12:30:00Z")), true);
  state.publicationRequirements![0].observation = d("2026-08-01");
  assert.equal(releaseConsumed(state, d("2026-10-20T12:30:00Z")), false);
});

test("FRED delayed publication repairs an already advanced schedule and preserves bounded retries", () => {
  const future = d("2026-11-13T13:33:00Z"), now = d("2026-10-20T01:00:00Z");
  const state: PackageRunState = { requiresPublicationProof: true,
    lastSuccessAt: d("2026-10-15T12:47:00Z"), sourceVerifiedAt: null };
  const params = { computedNextRunAt: future, currentNextRunAt: future,
    previousReleaseAt: d("2026-10-15T12:30:00Z"), now, runState: state };
  assert.equal(releaseConsumed(state, params.previousReleaseAt), false);
  const retry = resolvePackageNextRunAt(params);
  assert.equal(retry.reason, "hold_pending_release");
  assert.equal(retry.nextRunAt?.toISOString(), "2026-10-20T03:00:00.000Z");
  assert.equal(resolvePackageNextRunAt({ ...params, currentNextRunAt: retry.nextRunAt,
    now: d("2026-10-20T02:00:00Z") }).nextRunAt, retry.nextRunAt);
  state.sourceVerifiedAt = d("2026-10-19T15:00:00Z");
  assert.equal(resolvePackageNextRunAt(params).nextRunAt, future);
});

test("employment period proof preserves newer failure and bounded retry guards", () => {
  const release = d("2026-10-02T12:30:00Z");
  const state: PackageRunState = { lastSuccessAt: d("2026-10-02T14:00:00Z"),
    sourceVerifiedAt: d("2026-10-02T14:00:00Z"), requiredSeriesLatestObsDate: d("2026-08-01") };
  const decision = resolvePackageNextRunAt({ packageId: "us.bls.employment_situation",
    runState: state, previousReleaseAt: release, now: d("2026-10-03T12:00:00Z"),
    computedNextRunAt: d("2026-11-06T13:33:00Z"), currentNextRunAt: d("2026-11-06T13:33:00Z") });
  assert.equal(decision.nextRunAt?.toISOString(), "2026-10-03T14:00:00.000Z");
  state.requiredSeriesLatestObsDate = d("2026-09-01");
  state.hasUnresolvedFailures = true;
  assert.equal(releaseConsumed(state, release, "us.bls.employment_situation"), false);
});

test("CPI early no-change fetch cannot consume the release or skip its bounded retry", () => {
  const now = d("2026-10-14T14:00:00Z");
  const future = d("2026-11-10T13:33:00Z");
  const state: PackageRunState = {
    lastSuccessAt: d("2026-10-14T12:41:00Z"), sourceVerifiedAt: d("2026-10-14T12:41:00Z"),
    requiredMonthlyObservation: { oldest: d("2026-08-01"), lagMonths: 1 },
  };
  const release = d("2026-10-14T12:30:00Z");
  assert.equal(releaseConsumed(state, release), false);
  const params = { computedNextRunAt: future, currentNextRunAt: future, previousReleaseAt: release, runState: state, now };
  const decision = resolvePackageNextRunAt(params);
  assert.equal(decision.reason, "hold_pending_release");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-10-14T16:00:00.000Z");
  assert.equal(resolvePackageNextRunAt({ ...params, currentNextRunAt: decision.nextRunAt }).nextRunAt, decision.nextRunAt);
  state.requiredMonthlyObservation!.oldest = d("2026-09-01");
  assert.equal(releaseConsumed(state, release), true);
  assert.equal(resolvePackageNextRunAt(params).nextRunAt, future);
});

test("CPI period proof handles January release, unknown local period and unverified fetch time", () => {
  const state: PackageRunState = { lastSuccessAt: d("2027-01-14"), sourceVerifiedAt: null,
    requiredMonthlyObservation: { oldest: d("2026-12-01"), lagMonths: 1 } };
  assert.equal(releaseConsumed(state, d("2027-01-13")), true);
  state.requiredMonthlyObservation!.oldest = null;
  assert.equal(releaseConsumed(state, d("2027-01-13")), false);
});

test("failed member preserves its bounded retry rather than jumping month or retrying immediately", () => {
  const retry = d("2026-10-10T13:00:00Z");
  const result = resolvePackageNextRunAt({ currentNextRunAt:retry, computedNextRunAt:d("2026-11-04T15:03:00Z"),
    previousReleaseAt:d("2026-10-05T14:00:00Z"), now:d("2026-10-10T11:00:00Z"),
    runState:{lastSuccessAt:d("2026-09-05Z"),sourceVerifiedAt:null,hasUnresolvedFailures:true} });
  assert.equal(result.nextRunAt, retry);
  assert.equal(result.reason,"hold_pending_release");
});

test("Eurostat overdue timestamp can advance after ALL members freshly caught up", () => {
  const result = resolvePackageNextRunAt({ currentNextRunAt: d("2026-10-02T09:01:00Z"),
    previousReleaseAt: d("2026-10-16T09:00:00Z"), computedNextRunAt: d("2026-10-16T09:03:00Z"),
    now: d("2026-10-10T11:00:00Z"), runState: { lastSuccessAt: d("2026-10-10T10:30:00Z"), sourceVerifiedAt: d("2026-10-10T10:30:00Z") } });
  assert.equal(result.reason, "calendar");
  assert.equal(result.nextRunAt?.toISOString(), "2026-10-16T09:03:00.000Z");
});

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

test("非农发布后 FRED 仍只有上月观测，不能按已运行就跳到下一期", () => {
  const decision = resolvePackageNextRunAt({
    packageId: "us.bls.employment_situation",
    computedNextRunAt: d("2026-11-06T13:33:00Z"),
    currentNextRunAt: d("2026-10-02T14:50:00Z"),
    previousReleaseAt: d("2026-10-02T12:30:00Z"),
    runState: {
      lastSuccessAt: d("2026-10-02T12:50:00Z"),
      sourceVerifiedAt: null,
      requiredSeriesLatestObsDate: d("2026-08-01T00:00:00Z"),
    },
    now: d("2026-10-02T13:00:00Z"),
  });
  assert.equal(decision.reason, "hold_pending_release");
  assert.equal(decision.nextRunAt?.toISOString(), "2026-10-02T14:50:00.000Z");
});

test("非农新观测入库后，即使旧 sourceSync 未更新也可进入下一期", () => {
  const decision = resolvePackageNextRunAt({
    packageId: "us.bls.employment_situation",
    computedNextRunAt: d("2026-11-06T13:33:00Z"),
    currentNextRunAt: d("2026-10-02T14:50:00Z"),
    previousReleaseAt: d("2026-10-02T12:30:00Z"),
    runState: {
      lastSuccessAt: d("2026-10-02T14:50:00Z"),
      sourceVerifiedAt: d("2026-09-04T12:50:00Z"),
      requiredSeriesLatestObsDate: d("2026-09-01T00:00:00Z"),
    },
    now: d("2026-10-02T15:00:00Z"),
  });
  assert.equal(decision.reason, "calendar");
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

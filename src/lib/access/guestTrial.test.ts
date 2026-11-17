import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUEST_TRIAL_DAYS,
  isGuestTrialExpired,
  parseGuestStartedAt,
} from "./guestTrial";

const DAY = 24 * 60 * 60 * 1000;

test("parseGuestStartedAt 拒绝空值与非法值", () => {
  const now = Date.UTC(2026, 10, 17);
  assert.equal(parseGuestStartedAt(null, now), null);
  assert.equal(parseGuestStartedAt("", now), null);
  assert.equal(parseGuestStartedAt("abc", now), null);
  assert.equal(parseGuestStartedAt("-1", now), null);
  assert.equal(parseGuestStartedAt(String(now + 2 * DAY), now), null);
});

test("parseGuestStartedAt 接受合法 epoch", () => {
  const now = Date.UTC(2026, 10, 17);
  const started = now - 3 * DAY;
  assert.equal(parseGuestStartedAt(String(started), now), started);
});

test("游客试用在第 7 天整点到期", () => {
  const started = Date.UTC(2026, 10, 1);
  assert.equal(isGuestTrialExpired(null, started), false);
  assert.equal(isGuestTrialExpired(started, started + GUEST_TRIAL_DAYS * DAY - 1), false);
  assert.equal(isGuestTrialExpired(started, started + GUEST_TRIAL_DAYS * DAY), true);
  assert.equal(isGuestTrialExpired(started, started + (GUEST_TRIAL_DAYS + 1) * DAY), true);
});

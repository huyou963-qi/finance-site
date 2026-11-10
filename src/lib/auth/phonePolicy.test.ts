import assert from "node:assert/strict";
import test from "node:test";
import { profilePhoneRequired, registrationPhoneRequired } from "@/lib/auth/phonePolicy";

const zh = { locale: "zh" as const, englishAllowed: true };
const enOpen = { locale: "en" as const, englishAllowed: true };
const enClosed = { locale: "en" as const, englishAllowed: false };

test("注册：只有英文站且英文已开放时手机号可不填", () => {
  assert.equal(registrationPhoneRequired(zh), true);
  assert.equal(registrationPhoneRequired(enOpen), false);
  // 手动设 en cookie 但英文未对该身份开放：仍要手机号
  assert.equal(registrationPhoneRequired(enClosed), true);
});

test("资料：没有手机号的海外账号可保持为空，已有号码不能在英文站清空", () => {
  assert.equal(profilePhoneRequired(true, null, enOpen), false);
  assert.equal(profilePhoneRequired(true, "13800000000", enOpen), true);
  assert.equal(profilePhoneRequired(true, null, zh), true);
  assert.equal(profilePhoneRequired(true, null, enClosed), true);
  // 管理员/微信账号原本就不必填
  assert.equal(profilePhoneRequired(false, null, zh), false);
});

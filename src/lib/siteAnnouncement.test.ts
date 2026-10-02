import assert from "node:assert/strict";
import test from "node:test";
import { isAnnouncementActive, parseSiteAnnouncementInput } from "./siteAnnouncement";

test("公告仅在开启且处于生效时间段时有效", () => {
  const config = {
    enabled: true,
    startsAt: "2026-10-02T00:00:00.000Z",
    endsAt: "2026-10-03T00:00:00.000Z",
  };
  assert.equal(isAnnouncementActive(config, new Date("2026-10-02T12:00:00.000Z")), true);
  assert.equal(isAnnouncementActive(config, new Date("2026-10-03T00:00:00.000Z")), false);
  assert.equal(isAnnouncementActive({ ...config, enabled: false }, new Date("2026-10-02T12:00:00.000Z")), false);
});

test("公告配置拒绝空内容和倒置的时间段", () => {
  assert.throws(
    () => parseSiteAnnouncementInput({ enabled: true, title: "", content: "内容", startsAt: "2026-10-02", endsAt: "2026-10-03" }),
    /标题不能为空/,
  );
  assert.throws(
    () => parseSiteAnnouncementInput({ enabled: true, title: "标题", content: "内容", startsAt: "2026-10-03", endsAt: "2026-10-02" }),
    /结束时间必须晚于生效时间/,
  );
});

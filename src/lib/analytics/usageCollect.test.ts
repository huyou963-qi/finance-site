import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUsageCollectBody } from "./usageCollect";
import { resolveUsageAudience } from "./usageAudience";
import { extractArticleSlug, normalizeArticleSlug, normalizeUsagePath, resolveArticleSlug } from "./usagePath";
import { addShanghaiDays, shanghaiDateString, shanghaiDayBounds } from "./usageShanghaiDate";

test("normalizeUsagePath 去语言前缀并排除后台", () => {
  assert.equal(normalizeUsagePath("/en/macro"), "/macro");
  assert.equal(normalizeUsagePath("/macro?x=1"), "/macro");
  assert.equal(normalizeUsagePath("/admin/users"), null);
  assert.equal(normalizeUsagePath("/api/data/klines"), null);
});

test("extractArticleSlug 只认详情页", () => {
  assert.equal(extractArticleSlug("/articles/my-piece"), "my-piece");
  assert.equal(extractArticleSlug("/en/articles/my-piece"), null); // 须先 normalize
  assert.equal(extractArticleSlug("/articles"), null);
  assert.equal(extractArticleSlug("/articles/editor"), null);
  assert.equal(extractArticleSlug("/articles/preview/abc"), null);
  assert.equal(extractArticleSlug("/articles/charts/1"), null);
  assert.equal(extractArticleSlug("/articles/connections"), null);
  assert.equal(extractArticleSlug(`/articles/${"x".repeat(129)}`), null);
  assert.equal(normalizeArticleSlug("bad.slug"), null);
  assert.equal(resolveArticleSlug("editor", "/articles/ok-slug"), "ok-slug");
  assert.equal(resolveArticleSlug("ok-slug", "/articles/other"), "ok-slug");
});

test("parseUsageCollectBody 校验与规范化", () => {
  const events = parseUsageCollectBody({
    events: [
      { kind: "page_view", sessionId: "s1", guestId: "g1", path: "/en/macro", activeMs: 99 },
      { kind: "heartbeat", sessionId: "s1", guestId: "g1", path: "/macro", activeMs: 30000 },
      { kind: "page_view", sessionId: "s1", guestId: "g1", path: "/admin/users" },
      { kind: "page_view", sessionId: "s1", guestId: "g1", path: "/en/articles/hello-world" },
    ],
  });
  assert.equal(events.length, 3);
  assert.equal(events[0]?.path, "/macro");
  assert.equal(events[0]?.activeMs, 0);
  assert.equal(events[0]?.featureId, "macro");
  assert.equal(events[0]?.articleSlug, null);
  assert.equal(events[1]?.activeMs, 30000);
  assert.equal(events[2]?.path, "/articles/hello-world");
  assert.equal(events[2]?.featureId, "articles");
  assert.equal(events[2]?.articleSlug, "hello-world");
});

test("parseUsageCollectBody 拒绝非法 kind", () => {
  assert.throws(
    () => parseUsageCollectBody({ events: [{ kind: "click", sessionId: "s1", path: "/macro" }] }),
    /kind/,
  );
});

test("resolveUsageAudience 身份映射", () => {
  assert.equal(resolveUsageAudience(null), "guest");
  assert.equal(resolveUsageAudience({ role: "user", plan: "standard", trialEndsAt: null, planExpiresAt: null }), "standard");
  assert.equal(
    resolveUsageAudience({
      role: "user",
      plan: "standard",
      trialEndsAt: new Date(Date.now() + 86400_000),
      planExpiresAt: null,
    }),
    "pro",
  );
  assert.equal(
    resolveUsageAudience({
      role: "user",
      plan: "pro",
      trialEndsAt: null,
      planExpiresAt: new Date(Date.now() + 86400_000),
    }),
    "pro",
  );
  assert.equal(resolveUsageAudience({ role: "admin", plan: "standard" }), "admin");
  assert.equal(resolveUsageAudience({ role: "admin_support", plan: "standard" }), "admin");
});

test("shanghaiDayBounds 日界", () => {
  const { start, end } = shanghaiDayBounds("2026-11-24");
  assert.equal(start.toISOString(), "2026-11-23T16:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-24T16:00:00.000Z");
  assert.equal(addShanghaiDays("2026-11-24", -1), "2026-11-23");
  assert.match(shanghaiDateString(new Date("2026-11-24T02:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
});

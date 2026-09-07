import assert from "node:assert/strict";
import test from "node:test";
import {
  createArticleSlug,
  parseArticleSourceManifest,
  parseArticleWriteInput,
} from "./articleSchema";

test("draft permits incomplete content", () => {
  const article = parseArticleWriteInput({
    slug: "policy-note",
    title: "政策观察",
    status: "draft",
  });
  assert.equal(article.bodyMarkdown, "");
  assert.deepEqual(article.sourceManifest, []);
});

test("published article requires cutoff and sources", () => {
  assert.throws(
    () =>
      parseArticleWriteInput({
        slug: "policy-note",
        title: "政策观察",
        summary: "摘要",
        bodyMarkdown: "正文",
        status: "published",
      }),
    /数据截止时间/,
  );
});

test("source manifest only accepts internal paths or http urls", () => {
  assert.deepEqual(
    parseArticleSourceManifest([
      { label: "宏观数据", kind: "internal", url: "/macro?key=fred:CPIAUCSL" },
    ])[0]?.kind,
    "internal",
  );
  assert.throws(
    () => parseArticleSourceManifest([{ label: "坏链接", kind: "external", url: "javascript:x" }]),
    /http\(s\)/,
  );
});

test("generated slug is stable-shaped", () => {
  assert.equal(createArticleSlug(new Date("2026-09-07T00:00:00Z"), 0), "article-20260907-000000");
});

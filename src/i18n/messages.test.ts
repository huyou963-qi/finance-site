import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  flattenMessageKeys,
  localizeHref,
  mergeMessages,
  parseLocale,
  splitLocalePath,
  type Messages,
} from "@/i18n/locales";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";

/**
 * 已完成翻译的文件：除注释外不得再出现汉字（文案应放进 messages/*.json）。
 * 每翻完一个文件就加进来，防止后续改动又写回硬编码中文。
 */
const TRANSLATED_FILES = [
  "src/components/SiteHeaderNav.tsx",
  "src/components/LanguageSwitcher.tsx",
  "src/components/SiteHeaderShell.tsx",
  "src/i18n/navigation.tsx",
];

test("parseLocale 只认 en，其余回退中文", () => {
  assert.equal(parseLocale("en"), "en");
  assert.equal(parseLocale("zh"), "zh");
  assert.equal(parseLocale("fr"), "zh");
  assert.equal(parseLocale(undefined), "zh");
});

test("splitLocalePath：只认 /en 和 /en/ 开头", () => {
  assert.deepEqual(splitLocalePath("/en"), { locale: "en", pathname: "/" });
  assert.deepEqual(splitLocalePath("/en/macro"), { locale: "en", pathname: "/macro" });
  assert.deepEqual(splitLocalePath("/enterprise"), { locale: "zh", pathname: "/enterprise" });
  assert.deepEqual(splitLocalePath("/macro"), { locale: "zh", pathname: "/macro" });
});

test("localizeHref：加/去前缀，保留查询与锚点，跳过外链与 API", () => {
  assert.equal(localizeHref("/macro?x=1#a", "en"), "/en/macro?x=1#a");
  assert.equal(localizeHref("/", "en"), "/en");
  assert.equal(localizeHref("/en/macro", "en"), "/en/macro");
  assert.equal(localizeHref("/en/macro?x=1", "zh"), "/macro?x=1");
  assert.equal(localizeHref("/en", "zh"), "/");
  assert.equal(localizeHref("/api/auth/me", "en"), "/api/auth/me");
  assert.equal(localizeHref("https://example.com/x", "en"), "https://example.com/x");
  assert.equal(localizeHref("//evil.com", "en"), "//evil.com");
  assert.equal(localizeHref("#top", "en"), "#top");
});

test("英文缺键时回退中文，嵌套合并", () => {
  const merged = mergeMessages(
    { a: { x: "甲", y: "乙" }, b: "丙" },
    { a: { x: "A" } },
  );
  assert.deepEqual(merged, { a: { x: "A", y: "乙" }, b: "丙" });
});

test("en.json 不含 zh.json 没有的键（中文是键名的唯一来源）", () => {
  const zhKeys = new Set(flattenMessageKeys(zh as Messages));
  const orphan = flattenMessageKeys(en as Messages).filter((k) => !zhKeys.has(k));
  assert.deepEqual(orphan, []);
});

test("已翻译文件不含硬编码中文", () => {
  const cjk = /[㐀-鿿＀-￯]/;
  for (const file of TRANSLATED_FILES) {
    const src = readFileSync(resolve(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const bad = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => cjk.test(line));
    assert.deepEqual(bad, [], `${file} 仍有硬编码中文`);
  }
});

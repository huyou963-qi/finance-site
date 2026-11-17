import assert from "node:assert/strict";
import test from "node:test";
import { localizeHref } from "@/i18n/locales";
import { absoluteUrl } from "@/lib/seo/siteUrl";

/**
 * localeAlternates 依赖 next/headers，这里只校验路径拼装约定：
 * 中文无前缀、英文 /en，绝对地址由 absoluteUrl 补全。
 */
test("locale path convention for alternates", () => {
  assert.equal(localizeHref("/equity/industries", "zh"), "/equity/industries");
  assert.equal(localizeHref("/equity/industries", "en"), "/en/equity/industries");
  assert.equal(absoluteUrl("/en/articles/foo").endsWith("/en/articles/foo"), true);
});

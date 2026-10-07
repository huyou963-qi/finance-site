import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTICLE_COMMENT_MAX_LENGTH,
  parseArticleCommentBody,
} from "./articleCommentSchema";

test("article comment trims surrounding whitespace and normalizes line endings", () => {
  assert.equal(parseArticleCommentBody({ body: "  第一行\r\n第二行  " }), "第一行\n第二行");
});

test("article comment rejects empty content", () => {
  assert.throws(() => parseArticleCommentBody({ body: "  \n " }), /不能为空/);
  assert.throws(() => parseArticleCommentBody(null), /不能为空/);
});

test("article comment enforces the length limit", () => {
  assert.equal(
    parseArticleCommentBody({ body: "字".repeat(ARTICLE_COMMENT_MAX_LENGTH) }).length,
    ARTICLE_COMMENT_MAX_LENGTH,
  );
  assert.throws(
    () => parseArticleCommentBody({ body: "字".repeat(ARTICLE_COMMENT_MAX_LENGTH + 1) }),
    /不能超过/,
  );
});

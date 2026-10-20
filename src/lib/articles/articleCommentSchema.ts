export const ARTICLE_COMMENT_MAX_LENGTH = 2_000;

export function parseArticleCommentBody(raw: unknown): string {
  if (!raw || typeof raw !== "object") throw new Error("评论内容不能为空");
  const value = (raw as { body?: unknown }).body;
  if (typeof value !== "string") throw new Error("评论内容不能为空");

  const body = value.replace(/\r\n?/g, "\n").trim();
  if (!body) throw new Error("评论内容不能为空");
  if (body.length > ARTICLE_COMMENT_MAX_LENGTH) {
    throw new Error(`评论不能超过 ${ARTICLE_COMMENT_MAX_LENGTH} 个字符`);
  }
  return body;
}

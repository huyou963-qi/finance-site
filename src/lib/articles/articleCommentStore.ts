import { prisma } from "@/lib/prisma";
import { parseArticleCommentBody } from "@/lib/articles/articleCommentSchema";

const COMMENT_LIST_LIMIT = 100;

type CommentViewer = { id: string; role: string } | null;

function serializeComment(
  row: {
    id: string;
    body: string;
    authorId: string;
    author: { username: string };
    createdAt: Date;
    updatedAt: Date;
  },
  viewer: CommentViewer,
) {
  return {
    id: row.id,
    body: row.body,
    author: row.author.username,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canDelete: !!viewer && (viewer.id === row.authorId || viewer.role === "admin"),
  };
}

export async function listArticleComments(articleId: string, viewer: CommentViewer) {
  const article = await prisma.article.findFirst({
    where: { id: articleId, status: "published" },
    select: { id: true },
  });
  if (!article) return null;

  const [count, rows] = await Promise.all([
    prisma.articleComment.count({ where: { articleId } }),
    prisma.articleComment.findMany({
      where: { articleId },
      orderBy: { createdAt: "desc" },
      take: COMMENT_LIST_LIMIT,
      select: {
        id: true,
        body: true,
        authorId: true,
        author: { select: { username: true } },
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    comments: rows.map((row) => serializeComment(row, viewer)),
    count,
    hasMore: count > rows.length,
  };
}

export async function createArticleComment(articleId: string, authorId: string, raw: unknown) {
  const body = parseArticleCommentBody(raw);
  const article = await prisma.article.findFirst({
    where: { id: articleId, status: "published" },
    select: { id: true },
  });
  if (!article) return null;

  const row = await prisma.articleComment.create({
    data: { articleId, authorId, body },
    select: {
      id: true,
      body: true,
      authorId: true,
      author: { select: { username: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
  return serializeComment(row, { id: authorId, role: "user" });
}

export async function deleteArticleComment(
  articleId: string,
  commentId: string,
  viewer: Exclude<CommentViewer, null>,
) {
  const comment = await prisma.articleComment.findFirst({
    where: { id: commentId, articleId },
    select: { id: true, authorId: true },
  });
  if (!comment) return "missing" as const;
  if (comment.authorId !== viewer.id && viewer.role !== "admin") return "forbidden" as const;

  await prisma.articleComment.delete({ where: { id: comment.id } });
  return "deleted" as const;
}

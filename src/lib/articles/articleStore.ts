import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  parseArticleSourceManifest,
  parseArticleWriteInput,
  type ArticleWriteInput,
} from "@/lib/articles/articleSchema";

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function serializeAsset(row: {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  sourceKind: string;
  sourceUrl: string | null;
  sourceConfig: Prisma.JsonValue | null;
  capturedAt: Date;
  createdAt: Date;
}) {
  return {
    ...row,
    url: `/api/article-assets/${row.id}`,
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeArticle(row: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  bodyMarkdown?: string;
  status: string;
  dataCutoff: Date | null;
  sourceManifest: Prisma.JsonValue;
  author: { username: string };
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assets?: Parameters<typeof serializeAsset>[0][];
}) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: row.tags,
    bodyMarkdown: row.bodyMarkdown ?? "",
    status: row.status,
    dataCutoff: iso(row.dataCutoff),
    sourceManifest: parseArticleSourceManifest(row.sourceManifest),
    author: row.author.username,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.assets ? { assets: row.assets.map(serializeAsset) } : {}),
  };
}

const articleInclude = {
  author: { select: { username: true } },
  assets: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      sha256: true,
      sourceKind: true,
      sourceUrl: true,
      sourceConfig: true,
      capturedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function writeData(input: ArticleWriteInput) {
  return {
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    category: input.category,
    tags: input.tags,
    bodyMarkdown: input.bodyMarkdown,
    status: input.status,
    dataCutoff: input.dataCutoff,
    sourceManifest: input.sourceManifest as unknown as Prisma.InputJsonValue,
  };
}

export async function listArticles(options?: { manage?: boolean }) {
  const rows = await prisma.article.findMany({
    where: options?.manage ? undefined : { status: "published" },
    orderBy: options?.manage
      ? { updatedAt: "desc" }
      : [{ publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      tags: true,
      status: true,
      dataCutoff: true,
      sourceManifest: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { username: true } },
    },
  });
  return rows.map((row) => serializeArticle(row));
}

export async function getArticleById(id: string) {
  const row = await prisma.article.findUnique({ where: { id }, include: articleInclude });
  return row ? serializeArticle(row) : null;
}

export async function getPublishedArticleBySlug(slug: string) {
  const row = await prisma.article.findFirst({
    where: { slug, status: "published" },
    include: articleInclude,
  });
  return row ? serializeArticle(row) : null;
}

export async function createArticle(raw: unknown, authorId: string) {
  const input = parseArticleWriteInput(raw);
  const row = await prisma.article.create({
    data: {
      ...writeData(input),
      authorId,
      publishedAt: input.status === "published" ? new Date() : null,
    },
    include: articleInclude,
  });
  return serializeArticle(row);
}

export async function updateArticle(id: string, raw: unknown) {
  const input = parseArticleWriteInput(raw);
  const existing = await prisma.article.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return null;
  const row = await prisma.article.update({
    where: { id },
    data: {
      ...writeData(input),
      publishedAt:
        input.status === "published"
          ? existing.status === "published"
            ? undefined
            : new Date()
          : null,
    },
    include: articleInclude,
  });
  return serializeArticle(row);
}

export async function deleteArticle(id: string): Promise<boolean> {
  const result = await prisma.article.deleteMany({ where: { id } });
  return result.count > 0;
}

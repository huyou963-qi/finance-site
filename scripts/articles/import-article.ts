import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/prisma";
import { parseArticleWriteInput } from "../../src/lib/articles/articleSchema";

type AssetInput = {
  placeholder: string;
  path: string;
  alt?: string;
  sourceKind: "internal_macro" | "internal_market" | "external_chart";
  sourceUrl?: string;
  sourceConfig?: Record<string, unknown>;
  capturedAt?: string;
};

type ArticleBundle = Record<string, unknown> & { assets?: AssetInput[] };

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function argValue(name: string): string | undefined {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return direct?.slice(name.length + 1);
}

function validateAssets(bundlePath: string, assets: AssetInput[]): Array<AssetInput & { absolutePath: string; mimeType: string }> {
  const base = resolve(bundlePath, "..");
  const placeholders = new Set<string>();
  return assets.map((asset, index) => {
    if (!asset || typeof asset !== "object") throw new Error(`assets[${index}] 格式无效`);
    if (!asset.placeholder?.trim() || !asset.placeholder.startsWith("{{chart:")) {
      throw new Error(`assets[${index}].placeholder 须使用 {{chart:name}}`);
    }
    if (placeholders.has(asset.placeholder)) throw new Error(`图表占位符重复：${asset.placeholder}`);
    placeholders.add(asset.placeholder);
    if (!asset.path?.trim()) throw new Error(`assets[${index}].path 必填`);
    if (!["internal_macro", "internal_market", "external_chart"].includes(asset.sourceKind)) {
      throw new Error(`assets[${index}].sourceKind 无效`);
    }
    if (!asset.sourceUrl?.trim()) throw new Error(`assets[${index}].sourceUrl 必填`);
    const absolutePath = resolve(base, asset.path);
    const size = statSync(absolutePath).size;
    if (size <= 0 || size > 8 * 1024 * 1024) throw new Error(`${asset.path} 必须在 8MB 以内`);
    const mimeType = MIME[extname(absolutePath).toLowerCase()];
    if (!mimeType) throw new Error(`${asset.path} 仅支持 PNG、JPEG 或 WebP`);
    return { ...asset, absolutePath, mimeType };
  });
}

async function main() {
  const bundleArg = process.argv[2];
  if (!bundleArg || bundleArg.startsWith("--")) {
    throw new Error("用法：npm run articles:import -- <article.json> [--dry-run] [--publish] [--author=username]");
  }
  const bundlePath = resolve(bundleArg);
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as ArticleBundle;
  const publish = process.argv.includes("--publish");
  const dryRun = process.argv.includes("--dry-run");
  const assets = validateAssets(bundlePath, bundle.assets ?? []);
  let bodyMarkdown = typeof bundle.bodyMarkdown === "string" ? bundle.bodyMarkdown : "";
  for (const asset of assets) {
    if (!bodyMarkdown.includes(asset.placeholder)) {
      throw new Error(`正文未使用图表占位符：${asset.placeholder}`);
    }
  }
  const requestedStatus = publish ? "published" : "draft";
  const parsed = parseArticleWriteInput({ ...bundle, status: requestedStatus, bodyMarkdown });
  if (dryRun) {
    console.log(`[articles] validation ok: ${parsed.slug}, ${assets.length} asset(s), status=${requestedStatus}`);
    return;
  }

  const username = argValue("--author");
  const author = await prisma.user.findFirst({
    where: username ? { username, role: "admin" } : { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true },
  });
  if (!author) throw new Error(username ? `管理员不存在：${username}` : "数据库中没有管理员账号");

  const sourceManifest = parsed.sourceManifest as unknown as Prisma.InputJsonValue;
  const existing = await prisma.article.findUnique({
    where: { slug: parsed.slug },
    select: { id: true, status: true, publishedAt: true },
  });
  if (existing?.status === "published" && !publish) {
    throw new Error("同 slug 文章已发布；请换 slug 创建草稿，或在明确授权后使用 --publish 更新");
  }
  const article = existing ?? await prisma.article.create({
        data: {
          slug: parsed.slug,
          title: parsed.title,
          summary: parsed.summary,
          category: parsed.category,
          tags: parsed.tags,
          bodyMarkdown,
          status: "draft",
          dataCutoff: parsed.dataCutoff,
          sourceManifest,
          authorId: author.id,
        },
        select: { id: true, status: true, publishedAt: true },
      });

  for (const asset of assets) {
    const bytes = readFileSync(asset.absolutePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let stored = await prisma.articleAsset.findFirst({
      where: { articleId: article.id, sha256 },
      select: { id: true },
    });
    if (!stored) {
      const capturedAt = asset.capturedAt ? new Date(asset.capturedAt) : new Date();
      if (Number.isNaN(capturedAt.getTime())) throw new Error(`${asset.placeholder}.capturedAt 日期无效`);
      stored = await prisma.articleAsset.create({
        data: {
          articleId: article.id,
          uploadedById: author.id,
          fileName: asset.path.split(/[\\/]/).pop()?.slice(0, 255) || "chart.png",
          mimeType: asset.mimeType,
          byteSize: bytes.byteLength,
          sha256,
          data: bytes,
          sourceKind: asset.sourceKind,
          sourceUrl: asset.sourceUrl,
          sourceConfig: asset.sourceConfig as Prisma.InputJsonValue | undefined,
          capturedAt,
        },
        select: { id: true },
      });
    }
    const alt = asset.alt?.trim() || "文章数据图表";
    bodyMarkdown = bodyMarkdown.replaceAll(
      asset.placeholder,
      `![${alt.replace(/[\[\]]/g, "")}](/api/article-assets/${stored.id})`,
    );
  }

  await prisma.article.update({
    where: { id: article.id },
    data: {
      title: parsed.title,
      summary: parsed.summary,
      category: parsed.category,
      tags: parsed.tags,
      bodyMarkdown,
      status: requestedStatus,
      dataCutoff: parsed.dataCutoff,
      sourceManifest,
      publishedAt: publish ? existing?.publishedAt ?? new Date() : null,
    },
  });
  console.log(`[articles] ${publish ? "published" : "draft saved"}: /articles/${parsed.slug} (${author.username})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

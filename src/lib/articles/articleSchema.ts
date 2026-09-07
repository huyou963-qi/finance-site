export type ArticleStatus = "draft" | "published";
export type ArticleSourceKind = "internal" | "external";

export type ArticleSource = {
  label: string;
  kind: ArticleSourceKind;
  url: string;
  observedAt?: string;
  note?: string;
};

export type ArticleWriteInput = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  bodyMarkdown: string;
  status: ArticleStatus;
  dataCutoff: Date | null;
  sourceManifest: ArticleSource[];
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new Error(`${field} 不能为空`);
  if (normalized.length > max) throw new Error(`${field} 最多 ${max} 个字符`);
  return normalized;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new Error("dataCutoff 必须是日期时间");
  }
  const raw = value instanceof Date ? value.toISOString() : value.trim();
  const date = new Date(DATE_ONLY_RE.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(date.getTime())) throw new Error("dataCutoff 日期无效");
  return date;
}

function parseTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("tags 必须是字符串数组");
  const tags = value.map((item, index) => text(item, `tags[${index}]`, 32));
  return [...new Set(tags)].slice(0, 12);
}

function parseSourceUrl(value: unknown, index: number): string {
  const url = text(value, `sourceManifest[${index}].url`, 2000);
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // 统一走下方错误。
  }
  throw new Error(`sourceManifest[${index}].url 必须是站内路径或 http(s) URL`);
}

export function parseArticleSourceManifest(value: unknown): ArticleSource[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("sourceManifest 必须是数组");
  if (value.length > 80) throw new Error("sourceManifest 最多 80 条");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`sourceManifest[${index}] 格式无效`);
    }
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    if (kind !== "internal" && kind !== "external") {
      throw new Error(`sourceManifest[${index}].kind 必须是 internal 或 external`);
    }
    const observedAt = row.observedAt
      ? text(row.observedAt, `sourceManifest[${index}].observedAt`, 64)
      : undefined;
    if (observedAt && Number.isNaN(new Date(observedAt).getTime())) {
      throw new Error(`sourceManifest[${index}].observedAt 日期无效`);
    }
    return {
      label: text(row.label, `sourceManifest[${index}].label`, 200),
      kind,
      url: parseSourceUrl(row.url, index),
      ...(observedAt ? { observedAt } : {}),
      ...(row.note ? { note: text(row.note, `sourceManifest[${index}].note`, 500) } : {}),
    };
  });
}

export function parseArticleWriteInput(raw: unknown): ArticleWriteInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("文章请求体格式无效");
  }
  const row = raw as Record<string, unknown>;
  const slug = text(row.slug, "slug", 120).toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error("slug 只能包含小写字母、数字和单个连字符");
  }
  const status = row.status ?? "draft";
  if (status !== "draft" && status !== "published") {
    throw new Error("status 必须是 draft 或 published");
  }
  const parsed: ArticleWriteInput = {
    slug,
    title: text(row.title, "title", 200),
    summary: text(row.summary ?? "", "summary", 1200, true),
    category: text(row.category ?? "policy-analysis", "category", 64),
    tags: parseTags(row.tags),
    bodyMarkdown: text(row.bodyMarkdown ?? "", "bodyMarkdown", 200_000, true),
    status,
    dataCutoff: parseDate(row.dataCutoff),
    sourceManifest: parseArticleSourceManifest(row.sourceManifest),
  };

  if (status === "published") {
    if (!parsed.summary) throw new Error("发布前必须填写摘要");
    if (!parsed.bodyMarkdown) throw new Error("发布前正文不能为空");
    if (!parsed.dataCutoff) throw new Error("发布前必须填写数据截止时间");
    if (parsed.dataCutoff.getTime() > Date.now() + 5 * 60_000) {
      throw new Error("数据截止时间不能晚于当前时间");
    }
    if (parsed.sourceManifest.length === 0) throw new Error("发布前至少登记一条来源");
  }
  return parsed;
}

export function createArticleSlug(now = new Date(), random = Math.random()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.floor(random * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
  return `article-${date}-${suffix}`;
}

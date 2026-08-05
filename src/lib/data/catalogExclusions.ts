import type { PrismaClient } from "@prisma/client";

function isMissingExclusionTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("macro_catalog_excluded_key") &&
    (message.includes("42P01") || message.includes("不存在") || message.includes("does not exist"))
  );
}

/**
 * 兼容尚未应用迁移的旧数据库：目录继续可用，直到部署执行 db:migrate。
 * 删除功能本身仍需要该迁移，因为它要写入 tombstone。
 */
export async function loadExcludedCatalogKeys(prisma: PrismaClient): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ catalog_key: string }>>`
      SELECT catalog_key FROM public.macro_catalog_excluded_key
    `;
    return new Set(rows.map((row) => row.catalog_key));
  } catch (error) {
    if (isMissingExclusionTable(error)) return new Set();
    throw error;
  }
}

/** 调度运行前检查 tombstone；旧库缺表时保持现有调度行为。 */
export async function isCatalogKeyExcluded(
  prisma: PrismaClient,
  keys: string[],
): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM public.macro_catalog_excluded_key
        WHERE catalog_key IN (${keys[0] ?? ""}, ${keys[1] ?? ""})
      ) AS exists
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    if (isMissingExclusionTable(error)) return false;
    throw error;
  }
}

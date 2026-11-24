import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_TEMPLATES, parseTemplateInput, readStoredColumns, type StockDataTemplate } from "./templates";

type StoredTemplate = { id: string; name: string; columns: unknown; symbols: unknown; updatedAt: Date };
export class TemplateStoreError extends Error {
  constructor(public readonly code: "TEMPLATE_LIMIT" | "TEMPLATE_NAME_EXISTS", message: string) { super(message); }
}

function toTemplate(row: StoredTemplate): StockDataTemplate {
  return {
    id: row.id, name: row.name, columns: readStoredColumns(row.columns),
    symbols: Array.isArray(row.symbols) ? row.symbols.filter((s): s is string => typeof s === "string") : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listStockDataTemplates(userId: string) {
  const rows = await prisma.userStockDataTemplate.findMany({ where: { userId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
  return rows.map(toTemplate);
}

export async function getStockDataTemplate(userId: string, id: string) {
  const row = await prisma.userStockDataTemplate.findFirst({ where: { userId, id } });
  return row ? toTemplate(row) : null;
}

export async function saveStockDataTemplate(userId: string, input: ReturnType<typeof parseTemplateInput>, mode: "upsert" | "create-only") {
  return prisma.$transaction(async tx => {
    // Both the website and MCP serialize the per-user name and capacity checks.
    await tx.$queryRaw`SELECT id FROM public."User" WHERE id = ${userId} FOR UPDATE`;
    const where = { userId_name: { userId, name: input.name } };
    const existing = await tx.userStockDataTemplate.findUnique({ where });
    if (existing && mode === "create-only") {
      const saved = toTemplate(existing);
      // Compare the stored document so retired columns do not turn a conflict into a retry.
      if (!isDeepStrictEqual(existing.columns, input.columns) || !isDeepStrictEqual(saved.symbols, input.symbols)) {
        throw new TemplateStoreError("TEMPLATE_NAME_EXISTS", "已有同名模板，请换一个名称另存");
      }
      return { template: saved, overwritten: false, created: false };
    }
    if (!existing && await tx.userStockDataTemplate.count({ where: { userId } }) >= MAX_TEMPLATES) {
      throw new TemplateStoreError("TEMPLATE_LIMIT", `最多保存 ${MAX_TEMPLATES} 个模板，请先在网站管理模板`);
    }
    const data = {
      columns: input.columns as unknown as Prisma.InputJsonValue,
      symbols: input.symbols ? (input.symbols as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    const row = existing
      ? await tx.userStockDataTemplate.update({ where, data })
      : await tx.userStockDataTemplate.create({ data: { userId, name: input.name, ...data } });
    return { template: toTemplate(row), overwritten: Boolean(existing), created: !existing };
  });
}

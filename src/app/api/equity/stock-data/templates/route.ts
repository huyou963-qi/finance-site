import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proErrorResponse, requireProUser } from "@/lib/auth/requirePro";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";
import { StockDataRequestError } from "@/lib/equity/stockData/request";
import { MAX_TEMPLATES, parseTemplateInput, readStoredColumns, type StockDataTemplate } from "@/lib/equity/stockData/templates";

const headers = { "Cache-Control": "private, no-store" };

type Guard = { userId: string } | { res: NextResponse };

async function guard(req: NextRequest, write: boolean): Promise<Guard> {
  if (write) {
    try {
      requireSameOrigin(req);
    } catch (e) {
      const err = sameOriginErrorResponse(e);
      return { res: NextResponse.json({ error: err?.error ?? "请求来源不正确" }, { status: err?.status ?? 403, headers }) };
    }
  }
  try {
    const access = await requireProUser(req);
    return { userId: access.id };
  } catch (e) {
    const { body, status } = proErrorResponse(e);
    return { res: NextResponse.json(body, { status, headers }) };
  }
}

function toTemplate(r: { id: string; name: string; columns: unknown; symbols: unknown; updatedAt: Date }): StockDataTemplate {
  return {
    id: r.id,
    name: r.name,
    columns: readStoredColumns(r.columns),
    symbols: Array.isArray(r.symbols) ? r.symbols.filter((s): s is string => typeof s === "string") : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** GET 当前用户的模板（按最近修改排序）。系统模板在前端代码里，不走接口 */
export async function GET(req: NextRequest) {
  const g = await guard(req, false);
  if ("res" in g) return g.res;
  try {
    const rows = await prisma.userStockDataTemplate.findMany({ where: { userId: g.userId }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ templates: rows.map(toTemplate) }, { headers });
  } catch (e) {
    console.error("[stock-data] list templates failed", e);
    return NextResponse.json({ error: "无法读取模板，请稍后重试" }, { status: 500, headers });
  }
}

/** POST { name, columns, symbols? }：同名覆盖，否则新建（每人最多 50 个） */
export async function POST(req: NextRequest) {
  const g = await guard(req, true);
  if ("res" in g) return g.res;
  let input: ReturnType<typeof parseTemplateInput>;
  try {
    input = parseTemplateInput(await req.json().catch(() => null));
  } catch (e) {
    const msg = e instanceof StockDataRequestError ? e.message : "请求格式不正确";
    return NextResponse.json({ error: msg }, { status: 400, headers });
  }
  try {
    const existing = await prisma.userStockDataTemplate.findUnique({ where: { userId_name: { userId: g.userId, name: input.name } }, select: { id: true } });
    if (!existing && (await prisma.userStockDataTemplate.count({ where: { userId: g.userId } })) >= MAX_TEMPLATES) {
      return NextResponse.json({ error: `最多保存 ${MAX_TEMPLATES} 个模板，请先删除不用的模板` }, { status: 400, headers });
    }
    const data = {
      columns: input.columns as unknown as Prisma.InputJsonValue,
      symbols: input.symbols ? (input.symbols as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    const row = await prisma.userStockDataTemplate.upsert({
      where: { userId_name: { userId: g.userId, name: input.name } },
      create: { userId: g.userId, name: input.name, ...data },
      update: data,
    });
    return NextResponse.json({ template: toTemplate(row), overwritten: !!existing }, { headers });
  } catch (e) {
    console.error("[stock-data] save template failed", e);
    return NextResponse.json({ error: "保存失败，请稍后重试" }, { status: 500, headers });
  }
}

/** DELETE ?id=：只能删自己的 */
export async function DELETE(req: NextRequest) {
  const g = await guard(req, true);
  if ("res" in g) return g.res;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少模板标识" }, { status: 400, headers });
  try {
    const { count } = await prisma.userStockDataTemplate.deleteMany({ where: { id, userId: g.userId } });
    if (!count) return NextResponse.json({ error: "模板不存在" }, { status: 404, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    console.error("[stock-data] delete template failed", e);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500, headers });
  }
}

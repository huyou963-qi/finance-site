import { NextRequest, NextResponse } from "next/server";
import { requireProUser, proErrorResponse } from "@/lib/auth/requirePro";
import { prisma } from "@/lib/prisma";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";
import { parseStrategyName, toStrategyRow } from "@/lib/quant/screenerStrategies";
import type { Prisma } from "@prisma/client";

/** 归属校验：策略必须属于当前用户，否则按不存在处理 */
async function findOwnStrategy(userId: string, id: string) {
  const row = await prisma.strategyDefinition.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw new Error("策略不存在");
  return row;
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireProUser(req);
    const { id } = await ctx.params;
    await findOwnStrategy(user.id, id);
    const body = (await req.json()) as { name?: unknown; config?: ScreenerConfig };
    const data: { name?: string; config?: Prisma.InputJsonValue } = {};
    if (body?.name !== undefined) data.name = parseStrategyName(body.name);
    if (body?.config !== undefined) {
      validateScreenerConfig(body.config);
      data.config = body.config as unknown as Prisma.InputJsonValue;
    }
    if (!Object.keys(data).length) throw new Error("没有要更新的字段");
    const updated = await prisma.strategyDefinition.update({ where: { id }, data });
    return NextResponse.json({ strategy: toStrategyRow(updated) });
  } catch (e) {
    const mapped = proErrorResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "未知错误";
    const status = message.includes("不存在") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireProUser(req);
    const { id } = await ctx.params;
    await findOwnStrategy(user.id, id);
    await prisma.strategyDefinition.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const mapped = proErrorResponse(e);
    if (mapped.status === 401 || mapped.status === 403) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const message = e instanceof Error ? e.message : "未知错误";
    const status = message.includes("不存在") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

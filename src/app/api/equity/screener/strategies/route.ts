import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateScreenerConfig, type ScreenerConfig } from "@/lib/quant/screener";
import { parseStrategyName, toStrategyRow } from "@/lib/quant/screenerStrategies";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const strategies = await prisma.strategyDefinition.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ strategies: strategies.map(toStrategyRow) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = (await req.json()) as { name?: unknown; config?: ScreenerConfig };
    const name = parseStrategyName(body?.name);
    if (!body?.config) throw new Error("缺少策略配置");
    validateScreenerConfig(body.config);
    const created = await prisma.strategyDefinition.create({
      data: {
        userId: user.id,
        name,
        config: body.config as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ strategy: toStrategyRow(created) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

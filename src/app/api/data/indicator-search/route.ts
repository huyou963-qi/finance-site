import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchIndicators } from "@/lib/data/indicatorSearch";

/**
 * GET /api/data/indicator-search?q=&limit=
 * 站内指标 +（登录且有密钥时）FRED / World Bank 外部搜索。
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    const user = await getUserByRequest(req);
    const includeExternal = Boolean(user);

    const result = await searchIndicators(prisma, {
      q,
      limit,
      includeExternal,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

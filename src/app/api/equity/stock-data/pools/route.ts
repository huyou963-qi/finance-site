import { NextRequest, NextResponse } from "next/server";
import { proErrorResponse, requireProUser } from "@/lib/auth/requirePro";
import { listSystemPools, loadPoolMembers } from "@/lib/equity/stockData/pools";

const headers = { "Cache-Control": "private, max-age=300" };

/** GET /api/equity/stock-data/pools          → 系统股票池列表
 *  GET /api/equity/stock-data/pools?id=sp500 → 该池成分（按市值降序）  （Pro 专属） */
export async function GET(req: NextRequest) {
  try {
    await requireProUser(req);
  } catch (e) {
    const { body, status } = proErrorResponse(e);
    return NextResponse.json(body, { status });
  }
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ pools: await listSystemPools() }, { headers });
    const members = await loadPoolMembers(id);
    if (!members) return NextResponse.json({ error: "未知股票池" }, { status: 404 });
    return NextResponse.json({ id, members }, { headers });
  } catch (e) {
    console.error("[stock-data] pools failed", e);
    return NextResponse.json({ error: "无法读取股票池，请稍后重试" }, { status: 500 });
  }
}

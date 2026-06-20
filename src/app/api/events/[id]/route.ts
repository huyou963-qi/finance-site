import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireAdmin, requireUser } from "@/lib/api/eventAuth";
import {
  deleteMarketEvent,
  getMarketEventById,
  updateMarketEvent,
  type MarketEventInput,
} from "@/lib/data/marketEvents";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireUser(req);
    const { id } = await ctx.params;
    const event = await getMarketEventById(id);
    if (!event) return NextResponse.json({ error: "事件不存在" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    const body = (await req.json()) as Partial<MarketEventInput>;
    const event = await updateMarketEvent(id, body);
    return NextResponse.json({ event });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  try {
    await requireAdmin(req);
    const { id } = await ctx.params;
    await deleteMarketEvent(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

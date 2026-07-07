import { NextRequest, NextResponse } from "next/server";
import type { EventImportance } from "@prisma/client";
import { apiErrorResponse, requireAdmin } from "@/lib/api/eventAuth";
import {
  createMarketEvent,
  listMarketEvents,
  type MarketEventInput,
} from "@/lib/data/marketEvents";

function parseCsv(param: string | null): string[] {
  if (!param?.trim()) return [];
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const importance = parseCsv(sp.get("importance")) as EventImportance[];
    const result = await listMarketEvents({
      q: sp.get("q") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      countries: parseCsv(sp.get("countries")),
      industries: parseCsv(sp.get("industries")),
      assets: parseCsv(sp.get("assets")),
      importance: importance.length ? importance : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = (await req.json()) as MarketEventInput;
    const event = await createMarketEvent(admin.id, body);
    return NextResponse.json({ event }, { status: 201 });
  } catch (e) {
    const { msg, status } = apiErrorResponse(e);
    return NextResponse.json({ error: msg }, { status });
  }
}

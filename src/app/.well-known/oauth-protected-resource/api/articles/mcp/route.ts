import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/articles/articleOAuth";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(protectedResourceMetadata(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }); }

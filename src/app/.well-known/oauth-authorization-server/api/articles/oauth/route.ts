import { NextResponse } from "next/server";
import { authorizationMetadata } from "@/lib/articles/articleOAuth";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(authorizationMetadata(), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }); }

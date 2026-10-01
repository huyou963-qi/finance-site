import { protectedResourceMetadata } from "@/lib/oauth/weeklyPolicy";
export const dynamic = "force-dynamic";
export function GET() { return Response.json(protectedResourceMetadata, { headers: { "Cache-Control": "public, max-age=300" } }); }

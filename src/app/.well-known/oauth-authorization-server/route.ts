import { authorizationServerMetadata } from "@/lib/oauth/weeklyPolicy";
export const dynamic = "force-dynamic";
export function GET() { return Response.json(authorizationServerMetadata, { headers: { "Cache-Control": "public, max-age=300" } }); }

import { revoke } from "@/lib/oauth/weeklyRoutes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(req: Request) { return revoke(req); }

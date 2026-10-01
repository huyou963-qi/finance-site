import { token } from "@/lib/oauth/weeklyRoutes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(req: Request) { return token(req); }

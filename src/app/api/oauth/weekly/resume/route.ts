import { resume } from "@/lib/oauth/weeklyRoutes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: Request) { return resume(req); }

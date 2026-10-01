import { authorize } from "@/lib/oauth/weeklyRoutes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: Request) { return authorize(req); }
export function POST(req: Request) { return authorize(req); }

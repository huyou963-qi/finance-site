import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  loadSiteAnnouncementConfig,
  saveSiteAnnouncementConfig,
} from "@/lib/siteAnnouncement";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ announcement: await loadSiteAnnouncementConfig() });
  } catch (error) {
    const { message, status } = adminErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const body = (await req.json()) as { announcement?: unknown };
    const announcement = await saveSiteAnnouncementConfig(body.announcement, admin.username);
    return NextResponse.json({ announcement });
  } catch (error) {
    const { message, status } = adminErrorResponse(error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  deleteCalendarMappingOverride,
  listCalendarMappings,
  upsertCalendarMappingOverride,
} from "@/lib/data/scheduler/calendarMappingStore";
import type { CalendarMatchSpec } from "@/lib/data/scheduler/investingEventMap";

/** GET /api/admin/data-scheduler/calendar-mappings */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const data = await listCalendarMappings();
    return NextResponse.json({ ...data, builtAt: new Date().toISOString() });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** PUT /api/admin/data-scheduler/calendar-mappings */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = (await req.json()) as {
      fredKey?: string;
      spec?: CalendarMatchSpec;
      delete?: boolean;
    };
    const key = body.fredKey?.trim();
    if (!key) {
      return NextResponse.json({ error: "缺少 fredKey" }, { status: 400 });
    }

    if (body.delete) {
      const overrides = await deleteCalendarMappingOverride(key);
      return NextResponse.json({ ok: true, overrides });
    }

    const spec = body.spec;
    if (!spec?.keywords?.length) {
      return NextResponse.json({ error: "spec.keywords 不能为空" }, { status: 400 });
    }

    const overrides = await upsertCalendarMappingOverride(key, {
      countryCodes: spec.countryCodes ?? [],
      keywords: spec.keywords,
      excludeKeywords: spec.excludeKeywords,
      eventId: spec.eventId,
    });
    return NextResponse.json({ ok: true, overrides });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

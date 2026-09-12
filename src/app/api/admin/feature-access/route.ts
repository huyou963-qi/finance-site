import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/auth/requireAdmin";
import {
  loadFeatureAccessPolicy,
  saveFeatureAccessPolicy,
} from "@/lib/access/featureAccess";
import {
  FEATURE_CATALOG,
  FEATURE_GROUP_ORDER,
  defaultFeatureAccessPolicy,
} from "@/lib/access/featureCatalog";

export const dynamic = "force-dynamic";

function catalogPayload() {
  return {
    groups: FEATURE_GROUP_ORDER,
    features: FEATURE_CATALOG.map((f) => ({
      id: f.id,
      label: f.label,
      group: f.group,
      paths: f.paths,
      description: f.description,
      adminOnly: Boolean(f.adminOnly),
      defaults: f.defaults,
    })),
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const policy = await loadFeatureAccessPolicy();
    return NextResponse.json({
      ...catalogPayload(),
      policy,
      defaults: defaultFeatureAccessPolicy(),
    });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const me = await requireAdmin(req);
    const body = (await req.json()) as { policy?: unknown };
    const policy = await saveFeatureAccessPolicy(body.policy, me.username);
    return NextResponse.json({ ...catalogPayload(), policy });
  } catch (e) {
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json({ error: message }, { status });
  }
}

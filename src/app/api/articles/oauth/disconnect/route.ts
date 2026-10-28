import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/eventAuth";
import { prisma } from "@/lib/prisma";
import { articleResource, requireSameOrigin } from "@/lib/articles/articleOAuth";
import { absoluteUrl } from "@/lib/seo/siteUrl";
export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const admin = await requireAdmin(req);
    const form = await req.formData();
    await prisma.weeklyOAuthGrant.updateMany({ where: { id: String(form.get("grantId")), userId: admin.id, resource: articleResource() }, data: { revokedAt: new Date() } });
    return NextResponse.redirect(absoluteUrl("/articles/connections"), 303);
  } catch { return NextResponse.json({ error: "无权撤销授权" }, { status: 403 }); }
}

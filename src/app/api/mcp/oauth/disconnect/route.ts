import { NextRequest, NextResponse } from "next/server";
import { getAccessUserByToken, getSessionToken } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/articles/articleOAuth";
import { prisma } from "@/lib/prisma";
import { researchResource } from "@/lib/researchMcp/oauth";
import { absoluteUrl } from "@/lib/seo/siteUrl";

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const user = await getAccessUserByToken(getSessionToken(req));
    if (!user) return new NextResponse(null, { status: 401 });
    const form = await req.formData();
    await prisma.weeklyOAuthGrant.updateMany({
      where: { id: String(form.get("grantId") ?? ""), userId: user.id, resource: researchResource(), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return NextResponse.redirect(absoluteUrl("/ai-connections"), 303);
  } catch {
    return new NextResponse(null, { status: 403 });
  }
}

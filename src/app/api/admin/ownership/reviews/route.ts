import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminErrorResponse } from "@/lib/auth/requireAdmin";
import { requireSameOrigin, sameOriginErrorResponse } from "@/lib/http/sameOrigin";
import { appendOwnershipReview } from "@/lib/equity/ownershipReviews";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const user = await requireAdmin(req);
    const text = await req.text();
    if (text.length > 100000) return NextResponse.json({ error: "审核内容过大" }, { status: 413 });
    const result = await appendOwnershipReview(JSON.parse(text), String(user.id));
    return NextResponse.json({ id: result.id, revision: result.revision });
  } catch (e) {
    const originErr = sameOriginErrorResponse(e);
    if (originErr) return NextResponse.json({ error: originErr.error }, { status: originErr.status });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "审核写入失败或版本冲突，请刷新重试" },
        { status: ["P2002", "P2034"].includes(e.code) ? 409 : 503 },
      );
    }
    const { message, status } = adminErrorResponse(e);
    return NextResponse.json(
      { error: message.includes("Prisma") ? "审核写入失败或版本冲突，请刷新重试" : message },
      { status: message.includes("冲突") ? 409 : status },
    );
  }
}

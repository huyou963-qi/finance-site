import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, apiErrorResponse } from "@/lib/api/eventAuth";
import { appendOwnershipReview } from "@/lib/equity/ownershipReviews";
import { Prisma } from "@prisma/client";
export async function POST(req:NextRequest) {
  try {
    const user=await requireAdmin(req);
    const origin=req.headers.get("origin");
    if (origin && new URL(origin).host!==req.headers.get("host")) return NextResponse.json({error:"来源不匹配"},{status:403});
    const text=await req.text();
    if(text.length>100000) return NextResponse.json({error:"审核内容过大"},{status:413});
    const result=await appendOwnershipReview(JSON.parse(text),String(user.id));
    return NextResponse.json({id:result.id,revision:result.revision});
  } catch(e) {
    if(e instanceof Prisma.PrismaClientKnownRequestError) return NextResponse.json({error:"审核写入失败或版本冲突，请刷新重试"},{status:["P2002","P2034"].includes(e.code)?409:503});
    const {msg,status}=apiErrorResponse(e);
    return NextResponse.json({error:msg.includes("Prisma") ? "审核写入失败或版本冲突，请刷新重试" : msg},{status:msg.includes("冲突")?409:status});
  }
}

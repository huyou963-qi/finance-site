import { NextRequest, NextResponse } from "next/server";
import { loadOwnershipMonitor } from "@/lib/equity/ownershipMonitor";
import { isDay } from "@/lib/equity/ownershipReviewValidation";
export async function GET(req:NextRequest,ctx:{params:Promise<{symbol:string}>}) {
  const symbol=(await ctx.params).symbol.trim().toUpperCase();
  const asOf=req.nextUrl.searchParams.get("asOf")||new Date().toISOString().slice(0,10);
  if (!isDay(asOf)) return NextResponse.json({error:"截至日期无效"},{status:400});
  const from=req.nextUrl.searchParams.get("from")||new Date(Date.parse(asOf)-364*86400000).toISOString().slice(0,10);
  if (!/^[A-Z0-9.\-]{1,16}$/.test(symbol)||!isDay(asOf)||!isDay(from)||from>asOf||asOf>new Date().toISOString().slice(0,10)) return NextResponse.json({error:"标的或日期无效"},{status:400});
  try {
    const result=await loadOwnershipMonitor(symbol,asOf,from);
    return result ? NextResponse.json(result) : NextResponse.json({error:"未知标的"},{status:404});
  } catch(e) { console.error("ownership read failed",e instanceof Error ? e.name : "error"); return NextResponse.json({error:"持股数据读取失败，请检查数据库迁移与同步状态"},{status:503}); }
}

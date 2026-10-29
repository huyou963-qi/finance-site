import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deliveryHash, DeliveryError, newDeliveryToken, parsePackId } from "@/lib/events/privateEventDelivery";
const headers = { "Cache-Control": "private, no-store" };
async function change(req: NextRequest, remove: boolean) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "须从本站管理投递凭证" }, { status: 403, headers });
  try {
    const user = await getUserByRequest(req);
    if (!user) throw new DeliveryError("请先登录", 401);
    const raw = await req.text();
    if (raw.length > 1024) throw new DeliveryError("请求过大");
    let body; try { body = JSON.parse(raw); } catch { throw new DeliveryError("JSON 无效"); }
    if (body?.userId !== user.id) throw new DeliveryError("登录账号已变化，请刷新页面", 409);
    const packId = parsePackId(body.packId);
    const where = { userId: user.id, packId };
    if (remove) {
      await prisma.eventDeliveryCredential.deleteMany({ where });
      return NextResponse.json({ revoked: true }, { headers });
    }
    const token = newDeliveryToken(), expiresAt = new Date(Date.now() + 30 * 86400000);
    await prisma.$transaction(async tx => {
      if (!await tx.eventDeliveryCredential.findUnique({ where: { userId_packId: where } }) && await tx.eventDeliveryCredential.count({ where: { userId: user.id } }) >= 20) throw new DeliveryError("每个账号最多 20 个投递凭证");
      await tx.eventDeliveryCredential.upsert({ where: { userId_packId: where }, create: { ...where, tokenHash: deliveryHash(token), expiresAt }, update: { tokenHash: deliveryHash(token), expiresAt } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ token, packId, expiresAt }, { headers });
  } catch (e) { return NextResponse.json({ error: e instanceof DeliveryError ? e.message : "凭证操作未完成，请重试" }, { status: e instanceof DeliveryError ? e.status : 503, headers }); }
}
export const POST = (req: NextRequest) => change(req, false);
export const DELETE = (req: NextRequest) => change(req, true);

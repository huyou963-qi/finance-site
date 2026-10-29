import { NextRequest, NextResponse } from "next/server";
import { getUserByRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliveryError, parseDelivery } from "@/lib/events/privateEventDelivery";
import { receivePrivateEvents } from "@/lib/events/privateEventStore";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const user = await getUserByRequest(req);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
    const [rows, credentials] = await Promise.all([
      prisma.privateEventPack.findMany({ where: { userId: user.id }, select: { pack: true, revision: true, updatedAt: true } }),
      prisma.eventDeliveryCredential.findMany({ where: { userId: user.id }, select: { packId: true, expiresAt: true } }),
    ]);
    return NextResponse.json({ userId: user.id, packs: rows.map(r => ({ pack: r.pack, revision: r.revision, updatedAt: r.updatedAt })), credentials }, { headers });
  } catch { return NextResponse.json({ error: "云端事件暂时无法读取，请重试" }, { status: 503, headers }); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    if (!/^Bearer evt_[A-Za-z0-9_-]{43}$/.test(auth)) throw new DeliveryError("需要绑定事件包的 Bearer 投递凭证", 401);
    // Bound the stream itself; do not trust Content-Length or read an unbounded JSON body.
    const reader = req.body?.getReader();
    if (!reader) throw new DeliveryError("缺少投递内容");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 1000000) { await reader.cancel(); throw new DeliveryError("投递文件不能超过 1 MB", 413); }
      chunks.push(part.value);
    }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DeliveryError("投递 JSON 无效"); }
    const receipt = await receivePrivateEvents(auth.slice(7), parseDelivery(body));
    return NextResponse.json(receipt, { headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof DeliveryError ? e.message : "投递未完成，请以相同投递 ID 重试" }, { status: e instanceof DeliveryError ? e.status : 503, headers });
  }
}

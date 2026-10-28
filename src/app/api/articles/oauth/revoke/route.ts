import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { articleResource, hashCredential, registeredClient } from "@/lib/articles/articleOAuth";
export async function POST(req: NextRequest) {
  try {
    const form = new URLSearchParams(await req.text());
    const clientId = form.get("client_id") ?? "";
    registeredClient(clientId);
    const credential = await prisma.weeklyOAuthCredential.findUnique({ where: { hash: hashCredential(form.get("token") ?? "") }, include: { grant: true } });
    if (credential?.grant.clientId === clientId && credential.grant.resource === articleResource()) await prisma.weeklyOAuthGrant.update({ where: { id: credential.grantId }, data: { revokedAt: new Date() } });
    return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "invalid_client" }, { status: 401 }); }
}

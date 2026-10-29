import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliveryHash, DeliveryError, parseDelivery, planPrivateDelivery } from "./privateEventDelivery";
import type { LocalEventPack } from "@/lib/equity/localEventPacks";

export async function receivePrivateEvents(token: string, input: ReturnType<typeof parseDelivery>) {
  try {
    return await prisma.$transaction(async tx => {
      const credential = await tx.eventDeliveryCredential.findUnique({ where: { tokenHash: deliveryHash(token) }, include: { user: { select: { status: true } } } });
      if (!credential || credential.expiresAt <= new Date() || credential.user.status !== "active") throw new DeliveryError("投递凭证无效、已过期或已撤销", 401);
      if (credential.packId !== input.packId) throw new DeliveryError("该凭证只能投递绑定的事件包", 403);
      const key = { userId: credential.userId, packId: credential.packId };
      const existing = await tx.privateEventPack.findUnique({ where: { userId_packId: key } });
      const plan = planPrivateDelivery(input, existing ? { ...existing, pack: existing.pack as unknown as LocalEventPack } : undefined);
      if (plan.duplicate) return { ...plan.receipt as object, duplicate: true };
      if (!existing && await tx.privateEventPack.count({ where: { userId: credential.userId } }) >= 20) throw new DeliveryError("每个账号最多 20 个云端事件包");
      const data = { pack: plan.pack as unknown as Prisma.InputJsonValue, revision: plan.receipt.revision, deliveryId: input.deliveryId, deliveryHash: input.hash, receipt: plan.receipt as unknown as Prisma.InputJsonValue };
      if (existing) await tx.privateEventPack.update({ where: { userId_packId: key }, data });
      else await tx.privateEventPack.create({ data: { ...key, ...data } });
      return { ...plan.receipt, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(e.code)) throw new DeliveryError("并发投递冲突，请以相同 deliveryId 和内容重试；若版本已变化，需合并后重投", 409);
    throw e;
  }
}

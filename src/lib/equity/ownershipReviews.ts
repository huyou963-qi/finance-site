import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateReviewInput } from "./ownershipReviewValidation";

export async function appendOwnershipReview(raw: unknown, author: string) {
  const input = validateReviewInput(raw);
  return prisma.$transaction(async tx => {
    const security = await tx.equitySecurity.findUnique({ where: { symbol: input.symbol }, select: { id: true } });
    if (!security) throw new Error("标的不存在");
    const previous = await tx.ownershipReview.findFirst({ where: { symbol: input.symbol, key: input.key }, orderBy: { revision: "desc" } });
    if ((previous?.revision ?? 0) !== input.expectedRevision) throw new Error("版本冲突，请刷新后重试");
    if (previous && previous.kind !== input.payload.kind) throw new Error("同一证据键不能更改类型");
    if (input.payload.kind === "account" || input.payload.kind === "transaction") {
      if (input.payload.lineIds.some(id=>!/^\d{10}-\d{2}-\d{6}:\d+$/.test(id))) throw new Error("交易行标识需为 accession:行号");
      const rows = await tx.insiderTransaction.findMany({ where: { OR:input.payload.lineIds.map(id=>({accession:id.split(":")[0],lineIndex:Number(id.split(":")[1])})), symbol: input.symbol }, select: { id: true, filedAt: true } });
      if (rows.length !== input.payload.lineIds.length) throw new Error("交易行不存在或不属于此标的");
      if (rows.some(r => r.filedAt.toISOString().slice(0,10) > input.availableAt)) throw new Error("裁定可见日不能早于所引用申报");
    }
    const payload = input.payload.kind === "plan" ? { ...input.payload, plan: { ...input.payload.plan, verified: true, sourceUrl: input.sourceUrl, evidence: input.quote } } : input.payload;
    return tx.ownershipReview.create({ data: { symbol: input.symbol, key: input.key, revision: input.expectedRevision + 1,
      kind: payload.kind, payload: payload as unknown as Prisma.InputJsonValue, sourceUrl: input.sourceUrl,
      quote: input.quote, availableAt: new Date(input.availableAt), author: author.slice(0,128) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

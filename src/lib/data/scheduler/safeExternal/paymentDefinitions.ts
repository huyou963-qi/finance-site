import type { PrismaClient } from "@prisma/client";
import reviewed from "./reviewedPayments.json";

export const SAFE_PAYMENTS_REVIEW = {
  reviewedAt: "2026-10-29",
  sourceUrl: "https://www.safe.gov.cn/safe/file/file/20261020/c8db913913c0403ab9df424464f672ac.xls",
  officialPage: "https://www.safe.gov.cn/safe/2018/0419/8806.html",
};

/** Reviewed source identities, not inferred values. Keep the legacy IDs and keys. */
export const REVIEWED_PAYMENT_DEFINITIONS = reviewed.map(row => {
  const [, sheet, leaf] = row.sourceSeriesKey.split("|");
  const displayName = `银行代客涉外收付款：${sheet}：${row.section}：${leaf}`;
  return { ...row, displayName, name: `中国：外汇与国际收支：${displayName}`,
    sourceRowPath: `${row.section}/${leaf}`.replace(/\s+/g, "") };
});

export const REVIEWED_PAYMENT_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
  REVIEWED_PAYMENT_DEFINITIONS.map(row => [row.code, row.sourceRowPath]),
);

/** Bounded offline migration: no downloads, observation writes, or schedule changes.
 * One short transaction guards the reviewed keys and preserves concurrent metadata edits. */
export async function repairReviewedPaymentDefinitions(prisma: PrismaClient) {
  return prisma.$transaction(async tx => {
    let changed = 0;
    for (const definition of REVIEWED_PAYMENT_DEFINITIONS) {
      const old = await tx.instrument.findUnique({ where: { code: definition.code },
        select: { id: true, name: true, shortName: true, metadata: true } });
      if (!old) continue; // Never recreate a deliberately removed indicator.
      const subscription = await tx.dataSubscription.findUnique({ where: { instrumentId: old.id },
        select: { sourceId: true, sourceSeriesKey: true } });
      if (subscription?.sourceId !== "safe-external" || subscription.sourceSeriesKey !== definition.sourceSeriesKey)
        throw new Error(`SAFE reviewed payment source identity changed: ${definition.code}`);
      const previous = old.metadata && typeof old.metadata === "object" && !Array.isArray(old.metadata) ? old.metadata : {};
      const scrape = previous.scrape && typeof previous.scrape === "object" && !Array.isArray(previous.scrape) ? previous.scrape : {};
      if (typeof scrape.sourceRowPath === "string" && scrape.sourceRowPath !== definition.sourceRowPath)
        throw new Error(`SAFE reviewed payment parent changed: ${definition.code}`);
      if (old.name !== definition.previousName && old.name !== definition.name)
        throw new Error(`SAFE reviewed payment name changed: ${definition.code}`);
      if (old.name === definition.name && old.shortName === definition.displayName
        && previous.displayName === definition.displayName && scrape.sourceRowPath === definition.sourceRowPath
        && previous.paymentDefinitionAudit === SAFE_PAYMENTS_REVIEW.reviewedAt) continue;
      await tx.instrument.update({ where: { id: old.id }, data: {
        name: definition.name, shortName: definition.displayName,
        description: `国家外汇管理局${definition.displayName}`,
        metadata: { ...previous, displayName: definition.displayName, scrape: { ...scrape, sourceRowPath: definition.sourceRowPath },
          paymentDefinitionAudit: SAFE_PAYMENTS_REVIEW.reviewedAt, paymentDefinitionEvidence: SAFE_PAYMENTS_REVIEW },
      } });
      changed++;
    }
    return changed;
  }, { isolationLevel: "Serializable", timeout: 15_000 });
}

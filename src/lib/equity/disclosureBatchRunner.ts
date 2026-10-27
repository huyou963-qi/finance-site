import { prisma } from "@/lib/prisma";
import { disclosureDays } from "./dailyDisclosurePolicy";
import { syncDailyDisclosures, type DailyDisclosureOptions } from "./dailyDisclosures";

/** Run only while holding the existing global daily-disclosure advisory lock. */
export async function runRecordedDisclosureBatch(options: DailyDisclosureOptions,
  dependencies = { prisma, syncDailyDisclosures }) {
  if (options.dryRun) return dependencies.syncDailyDisclosures(options);
  const db = dependencies.prisma;
  const days = disclosureDays(new Date(), options.days ?? 7, options.through);
  // Holding the same lock proves an older running record has lost its worker.
  await db.equityDisclosureBatch.updateMany({ where: { status: "running" },
    data: { status: "failed", finishedAt: new Date(), error: "批次中断，未正常完成；由后续批次继续补漏" } });
  const batch = await db.equityDisclosureBatch.create({ data: {
    fromDay: new Date(days[0]), throughDay: new Date(days.at(-1)!),
    symbols: options.symbols?.map(symbol => symbol.trim().toUpperCase()).filter(Boolean) ?? [],
  } });
  try {
    const result = await dependencies.syncDailyDisclosures(options, undefined, async progress => {
      await db.equityDisclosureBatch.update({ where: { id: batch.id }, data: progress });
    });
    const status = result.failed || result.missingIndexes.length || result.remaining ? "partial" : "success";
    await db.equityDisclosureBatch.update({ where: { id: batch.id }, data: {
      status, finishedAt: new Date(), indexed: result.indexed, complete: result.complete,
      pending: result.pending, failed: result.failed, remaining: result.remaining,
      timingUpdated: result.timingUpdated,
      missingIndexes: result.missingIndexes, failedCiks: result.failedCiks,
    } });
    return { ...result, batchId: batch.id, batchStatus: status };
  } catch (error) {
    await db.equityDisclosureBatch.update({ where: { id: batch.id }, data: {
      status: "failed", finishedAt: new Date(), failed: { increment: 1 },
      error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    } });
    throw error;
  }
}

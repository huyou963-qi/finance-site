import type { EquityDisclosureBatch } from "@prisma/client";

export function disclosureHealth(batch: EquityDisclosureBatch | null, cik: string | null,
  announcementCount: number, now = new Date()) {
  if (!batch) return { state: "unknown" as const, message: "尚无每日更新记录，当前列表不能用于判断当天是否有新公告。", batch: null };
  const through = batch.throughDay.toISOString().slice(0, 10);
  const age = now.getTime() - batch.startedAt.getTime();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(now));
  // 19:15 daily run gets a two-hour grace period (until 21:15 Beijing).
  const minutes = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", minute: "2-digit" }).format(now));
  const beijingDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const expectedDate = new Date(`${beijingDay}T00:00:00Z`);
  expectedDate.setUTCDate(expectedDate.getUTCDate() - (hour * 60 + minutes >= 21 * 60 + 15 ? 1 : 2));
  const expected = expectedDate.toISOString().slice(0, 10);
  const covered = Boolean(cik && batch.coveredCiks.includes(cik));
  const discoveryComplete = covered && batch.missingIndexes.length === 0 && !batch.failedCiks.includes(cik!) && batch.status !== "failed";
  let state: "unknown" | "running" | "failed" | "stale" | "partial" | "success";
  let message: string;
  if (batch.status === "running") {
    state = age > 2 * 3600_000 ? "failed" : "running";
    message = state === "failed" ? "最近更新批次超时或中断，尚不能确认当天公告是否齐全。" : "每日更新正在进行，当前列表可能尚未齐全。";
  } else if (batch.status === "failed") {
    state = "failed"; message = "最近更新批次未成功完成，尚不能确认当天公告是否齐全。";
  } else if (through < expected) {
    state = "stale"; message = `公告更新滞后，最近批次仅覆盖至美东 ${through}。`;
  } else if (!discoveryComplete) {
    state = "partial"; message = `最近批次部分完成，本股截至美东 ${through} 的公告覆盖尚未确认。`;
  } else {
    state = batch.status === "success" ? "success" : "partial";
    const description = announcementCount === 0 ? "该日未发现本股已覆盖类型的公告" : `本股该日有 ${announcementCount} 份已覆盖类型公告`;
    message = `已核对至美东 ${through}，${description}。${state === "partial" ? "批次仍有待补齐或失败项。" : ""}`;
  }
  return { state, message, batch: {
    status: batch.status, through, startedAt: batch.startedAt.toISOString(), finishedAt: batch.finishedAt?.toISOString() ?? null,
    indexed: batch.indexed, complete: batch.complete, pending: batch.pending, failed: batch.failed,
    remaining: batch.remaining, missingIndexes: batch.missingIndexes,
    timingUpdated: batch.timingUpdated,
    announcementCount: discoveryComplete ? announcementCount : null,
    scope: batch.symbols.length ? "selected" : "all",
  } };
}

export type StockDisclosureHealth = ReturnType<typeof disclosureHealth>;

import type { PrismaClient } from "@prisma/client";

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 14;
const RUN_TIMEOUT_MS = 2 * 3_600_000;
const BACKLOG_RUNS = 3;
// Match finance-site-sector-history.cron (Beijing / Hong Kong time).
const SCHEDULE = ["11:15", "19:15"];
const beijingDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

export async function loadDisclosureBatchHistory(db: PrismaClient, now: Date) {
  const midnight = Date.parse(`${beijingDate.format(now)}T00:00:00+08:00`);
  const firstDay = midnight - (HISTORY_DAYS - 1) * DAY_MS;
  const rows = await db.equityDisclosureBatch.findMany({
    where: { symbols: { isEmpty: true }, startedAt: { gte: new Date(firstDay), lte: now } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: {
      id: true, status: true, startedAt: true, finishedAt: true, fromDay: true, throughDay: true,
      indexed: true, complete: true, pending: true, failed: true, remaining: true,
      missingIndexes: true, failedCiks: true,
    },
  });
  const byDay = new Map<string, DisclosureRun[]>();
  for (const { startedAt, finishedAt, fromDay, throughDay, failedCiks, status, ...row } of rows) {
    const date = beijingDate.format(startedAt);
    const runs = byDay.get(date) ?? [];
    runs.push({
      ...row,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt?.toISOString() ?? null,
      fromDay: fromDay.toISOString().slice(0, 10),
      throughDay: throughDay.toISOString().slice(0, 10),
      status: status === "running" && now.getTime() - startedAt.getTime() > RUN_TIMEOUT_MS ? "timeout" : status,
      failedCompanies: failedCiks.length,
    });
    byDay.set(date, runs);
  }
  const days = Array.from({ length: HISTORY_DAYS }, (_, offset) => {
    const date = beijingDate.format(midnight - offset * DAY_MS);
    return { date, runs: byDay.get(date) ?? [] };
  });
  const slots = [-1, 0, 1].flatMap((offset) => {
    const date = beijingDate.format(midnight + offset * DAY_MS);
    return SCHEDULE.map((time) => ({
      label: `${date} ${time}`,
      start: Date.parse(`${date}T${time}:00+08:00`),
    }));
  });
  const overdueIndex = slots.findLastIndex(({ start }) => start + RUN_TIMEOUT_MS <= now.getTime());
  const expected = slots[overdueIndex];
  const nextSlot = slots[overdueIndex + 1];
  const hasExpectedRun = rows.some(({ startedAt }) =>
    startedAt.getTime() >= expected.start && startedAt.getTime() < nextSlot.start);

  const recent = days.flatMap(({ runs }) => runs).filter(({ status }) => status !== "running").slice(0, BACKLOG_RUNS);
  const persistentBacklog = recent.length === BACKLOG_RUNS && recent.every(({ status, finishedAt, remaining }) =>
    finishedAt && (status === "success" || status === "partial") && remaining > 0);

  return {
    days,
    overdueSlot: hasExpectedRun ? null : expected.label,
    backlog: persistentBacklog ? { runs: BACKLOG_RUNS, remaining: recent[0].remaining } : null,
  };
}

type DisclosureRun = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  fromDay: string;
  throughDay: string;
  indexed: number;
  complete: number;
  pending: number;
  failed: number;
  remaining: number;
  missingIndexes: string[];
  failedCompanies: number;
};

export type DisclosureBatchHistory = Awaited<ReturnType<typeof loadDisclosureBatchHistory>>;

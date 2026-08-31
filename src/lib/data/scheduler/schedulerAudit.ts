import {
  FetchRunStatus,
  SchedulerInvocationStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

export async function recordScheduleChange(
  prisma: PrismaClient,
  input: {
    subscriptionId?: string;
    releasePackageId?: string;
    previousNextRunAt: Date | null | undefined;
    nextRunAt: Date | null | undefined;
    source: string;
    reason: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  if (sameInstant(input.previousNextRunAt, input.nextRunAt)) return;
  await prisma.scheduleAuditEvent.create({
    data: {
      subscriptionId: input.subscriptionId,
      releasePackageId: input.releasePackageId,
      previousNextRunAt: input.previousNextRunAt ?? null,
      nextRunAt: input.nextRunAt ?? null,
      source: input.source.slice(0, 64),
      reason: input.reason.slice(0, 128),
      metadata: input.metadata,
    },
  });
}

/**
 * 进程被 kill/OOM 时 finally 不会执行。下一轮 worker 将长期未完成的审计行明确收口，
 * 避免它们永久停留在“初始 FAILED/RUNNING、finishedAt 为空”的含混状态。
 */
export async function recoverAbandonedSchedulerRuns(
  prisma: PrismaClient,
  options: { now?: Date; staleAfterHours?: number } = {},
): Promise<{ fetchRuns: number; invocations: number }> {
  const now = options.now ?? new Date();
  const staleAfterHours = Math.max(1, options.staleAfterHours ?? 6);
  const cutoff = new Date(now.getTime() - staleAfterHours * 3_600_000);
  const [fetchRuns, invocations] = await prisma.$transaction([
    prisma.fetchRun.updateMany({
      where: { finishedAt: null, startedAt: { lt: cutoff } },
      data: {
        finishedAt: now,
        status: FetchRunStatus.FAILED,
        error: `worker_interrupted: unfinished for more than ${staleAfterHours}h`,
      },
    }),
    prisma.schedulerInvocation.updateMany({
      where: {
        finishedAt: null,
        startedAt: { lt: cutoff },
        status: SchedulerInvocationStatus.RUNNING,
      },
      data: {
        finishedAt: now,
        status: SchedulerInvocationStatus.FAILED,
        error: `worker_interrupted: unfinished for more than ${staleAfterHours}h`,
      },
    }),
  ]);
  return { fetchRuns: fetchRuns.count, invocations: invocations.count };
}

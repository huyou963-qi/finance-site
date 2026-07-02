import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { syncSubscriptionsFromTradingEconomicsCalendar } from "./applyCalendarSchedules";
import {
  resolveAcquisitionStatus,
  resolveUpdateStatus,
  type AcquisitionStatus,
} from "./catalogAcquisition";
import { parseReleaseRule } from "./releaseRule";
import { runDataSubscription, type SubscriptionWithRelations } from "./runSubscription";
import { syncReleasePackage } from "./syncReleasePackage";

async function loadLatestFetchRunsByInstrument(
  prisma: PrismaClient,
  instrumentIds: string[],
): Promise<
  Map<
    string,
    {
      status: string;
      startedAt: Date;
      rowsUpserted: number;
      sourceLagDays: number | null;
    }
  >
> {
  const map = new Map<
    string,
    { status: string; startedAt: Date; rowsUpserted: number; sourceLagDays: number | null }
  >();
  if (instrumentIds.length === 0) return map;

  const rows = await prisma.$queryRaw<
    {
      instrument_id: string;
      status: string;
      started_at: Date;
      rows_upserted: number;
      source_lag_days: number | null;
    }[]
  >`
    SELECT DISTINCT ON (ds.instrument_id)
      ds.instrument_id::text AS instrument_id,
      fr.status::text AS status,
      fr.started_at,
      fr.rows_upserted,
      fr.source_lag_days
    FROM mds.fetch_run fr
    INNER JOIN mds.data_subscription ds ON ds.id = fr.subscription_id
    WHERE ds.instrument_id IN (${Prisma.join(instrumentIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY ds.instrument_id, fr.started_at DESC
  `;

  for (const r of rows) {
    map.set(r.instrument_id, {
      status: r.status,
      startedAt: r.started_at,
      rowsUpserted: r.rows_upserted,
      sourceLagDays: r.source_lag_days,
    });
  }
  return map;
}
export type SyncAllStaleDetail = {
  instrumentCode: string;
  instrumentName?: string;
  status: string;
  rowsUpserted: number;
  error?: string;
  acquisitionStatus: AcquisitionStatus;
  releasePackageId?: string | null;
  releasePackageLabelZh?: string | null;
  packageSyncId?: string;
};

export type SyncAllStaleResult = {
  calendarSynced: boolean;
  totalStale: number;
  attempted: number;
  success: number;
  failed: number;
  stillStale: number;
  dryRun: boolean;
  details: SyncAllStaleDetail[];
  packagesAttempted: number;
  packagesFailed: number;
  logs: string[];
};

export async function listStaleSubscriptions(
  prisma: PrismaClient,
  limit: number,
  now: Date = new Date(),
): Promise<SubscriptionWithRelations[]> {
  const subs = await prisma.dataSubscription.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "desc" }, { nextRunAt: "asc" }],
    include: {
      source: true,
      instrument: {
        select: { id: true, code: true, name: true, metadata: true },
      },
      releasePackage: {
        select: {
          id: true,
          labelZh: true,
          releaseTemplate: true,
          scheduleState: true,
          nextRunAt: true,
        },
      },
    },
  });

  const instrumentIds = subs.map((s) => s.instrument.id);
  const latestFetchByInstrument = await loadLatestFetchRunsByInstrument(prisma, instrumentIds);

  const stale = subs.filter((sub) => {
    const acquisitionStatus = resolveAcquisitionStatus({
      subscriptionEnabled: sub.enabled,
      adapterKind: sub.source.adapterKind,
      sourceSeriesKey: sub.sourceSeriesKey,
      metadata: sub.instrument.metadata,
    });
    const rule = parseReleaseRule(sub.releaseRule);
    const calendarMatch = rule.type === "economic_calendar" ? rule.calendarMatch : undefined;
    const sourceSync = rule.type === "economic_calendar" ? rule.sourceSync : undefined;
    const lastFetch = latestFetchByInstrument.get(sub.instrument.id);

    return (
      resolveUpdateStatus({
        acquisitionStatus,
        subscriptionEnabled: sub.enabled,
        nextRunAt: sub.nextRunAt,
        lastSuccessAt: sub.lastSuccessAt,
        lastFetchStatus: lastFetch?.status ?? null,
        lastFetchAt: lastFetch?.startedAt ?? null,
        lastFetchUpserted: lastFetch?.rowsUpserted ?? null,
        sourceLagDays: lastFetch?.sourceLagDays ?? null,
        sourceSync: sourceSync ?? null,
        calendarReleaseAt: calendarMatch?.releaseAt ?? null,
        now,
      }) === "stale"
    );
  });

  return stale.slice(0, limit) as SubscriptionWithRelations[];
}

export async function syncAllStaleSubscriptions(
  prisma: PrismaClient,
  options?: { limit?: number; dryRun?: boolean },
): Promise<SyncAllStaleResult> {
  const limit = options?.limit ?? 100;
  const dryRun = options?.dryRun ?? false;
  const now = new Date();

  if (!dryRun) {
    await syncSubscriptionsFromTradingEconomicsCalendar(prisma);
  }

  const staleSubs = await listStaleSubscriptions(prisma, limit, now);
  const details: SyncAllStaleDetail[] = [];
  const logs: string[] = [];
  let success = 0;
  let failed = 0;
  let packagesAttempted = 0;
  let packagesFailed = 0;

  type SyncUnit =
    | { kind: "package"; packageId: string; subs: SubscriptionWithRelations[] }
    | { kind: "single"; sub: SubscriptionWithRelations };

  const packageGroups = new Map<string, SubscriptionWithRelations[]>();
  const units: SyncUnit[] = [];

  for (const sub of staleSubs) {
    if (sub.releasePackageId) {
      const group = packageGroups.get(sub.releasePackageId) ?? [];
      group.push(sub);
      packageGroups.set(sub.releasePackageId, group);
    } else {
      units.push({ kind: "single", sub });
    }
  }
  for (const [packageId, subs] of packageGroups) {
    units.push({ kind: "package", packageId, subs });
  }

  for (const unit of units) {
    if (unit.kind === "package") {
      const acquisitionStatus = resolveAcquisitionStatus({
        subscriptionEnabled: unit.subs[0]!.enabled,
        adapterKind: unit.subs[0]!.source.adapterKind,
        sourceSeriesKey: unit.subs[0]!.sourceSeriesKey,
        metadata: unit.subs[0]!.instrument.metadata,
      });

      if (dryRun) {
        for (const sub of unit.subs) {
          details.push({
            instrumentCode: sub.instrument.code,
            instrumentName: sub.instrument.name,
            status: "dry_run",
            rowsUpserted: 0,
            acquisitionStatus,
            releasePackageId: unit.packageId,
            releasePackageLabelZh: sub.releasePackage?.labelZh ?? null,
          });
        }
        continue;
      }

      packagesAttempted += 1;
      const pkgResult = await syncReleasePackage(prisma, {
        releasePackageId: unit.packageId,
        force: true,
      });
      logs.push(...pkgResult.logs);

      const pushMember = (
        member: (typeof pkgResult.succeeded)[number],
        bucket: "success" | "failed" | "skipped",
      ) => {
        const status =
          bucket === "failed" ? "failed" : bucket === "skipped" ? "skipped" : member.status;
        details.push({
          instrumentCode: member.instrumentCode,
          instrumentName: member.instrumentName,
          status,
          rowsUpserted: member.rowsUpserted,
          error: member.error,
          acquisitionStatus,
          releasePackageId: pkgResult.releasePackageId,
          releasePackageLabelZh: pkgResult.releasePackageLabelZh,
          packageSyncId: pkgResult.packageSyncId,
        });
      };

      for (const m of pkgResult.succeeded) pushMember(m, "success");
      for (const m of pkgResult.failed) pushMember(m, "failed");
      for (const m of pkgResult.skipped) pushMember(m, "skipped");

      if (pkgResult.failed.length > 0) {
        packagesFailed += 1;
        failed += pkgResult.failed.length;
      }
      success += pkgResult.succeeded.length;
      continue;
    }

    const sub = unit.sub;
    const acquisitionStatus = resolveAcquisitionStatus({
      subscriptionEnabled: sub.enabled,
      adapterKind: sub.source.adapterKind,
      sourceSeriesKey: sub.sourceSeriesKey,
      metadata: sub.instrument.metadata,
    });

    if (dryRun) {
      details.push({
        instrumentCode: sub.instrument.code,
        instrumentName: sub.instrument.name,
        status: "dry_run",
        rowsUpserted: 0,
        acquisitionStatus,
      });
      continue;
    }

    const r = await runDataSubscription(prisma, sub, { force: true });
    logs.push(
      `[single] ${sub.instrument.code} ${r.status}${r.error ? ` | ${r.error}` : ""} (+${r.rowsUpserted})`,
    );
    if (r.status === "failed") {
      failed += 1;
      details.push({
        instrumentCode: sub.instrument.code,
        instrumentName: sub.instrument.name,
        status: r.status,
        rowsUpserted: r.rowsUpserted,
        error: r.error,
        acquisitionStatus,
      });
      continue;
    }

    await syncSubscriptionsFromTradingEconomicsCalendar(prisma, {
      subscriptionIds: [sub.id],
    });
    success += 1;
    details.push({
      instrumentCode: sub.instrument.code,
      instrumentName: sub.instrument.name,
      status: r.status,
      rowsUpserted: r.rowsUpserted,
      acquisitionStatus,
    });
  }

  const stillStale = dryRun
    ? staleSubs.length
    : (await listStaleSubscriptions(prisma, 10_000, new Date())).length;

  return {
    calendarSynced: !dryRun,
    totalStale: staleSubs.length,
    attempted: dryRun ? 0 : staleSubs.length,
    success,
    failed,
    stillStale,
    dryRun,
    details,
    packagesAttempted,
    packagesFailed,
    logs,
  };
}

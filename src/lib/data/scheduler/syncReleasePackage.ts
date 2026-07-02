import { FetchRunStatus, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { syncSubscriptionsFromTradingEconomicsCalendar } from "./applyCalendarSchedules";
import {
  clearTradingEconomicsIsmHtmlCache,
  fetchAllTradingEconomicsIsmPoints,
} from "./adapters/tradingEconomicsIsmAdapter";
import {
  clearTradingEconomicsIsmSvcHtmlCache,
  fetchAllTradingEconomicsIsmSvcPoints,
} from "./adapters/tradingEconomicsIsmSvcAdapter";
import { runDataSubscription, type SubscriptionWithRelations } from "./runSubscription";
import {
  ismSectorFromInstrumentCode,
  teLabelForInstrumentCode,
} from "./tradingEconomicsIndicator/ismCatalog";
import {
  ismSvcSectorFromInstrumentCode,
  teLabelForIsmSvcInstrumentCode,
} from "./tradingEconomicsIndicator/ismSvcCatalog";
import {
  seriesPointForSector as ismSeriesPointForSector,
  type TeIsmParsedPage,
} from "./tradingEconomicsIndicator/parseIsmPage";
import { seriesPointForSector as ismSvcSeriesPointForSector } from "./tradingEconomicsIndicator/parseIsmSvcPage";
import { upsertMacroObservations } from "./upsertObservations";

export type PackageMemberSyncDetail = {
  instrumentCode: string;
  instrumentName: string;
  status: "success" | "skipped" | "partial" | "failed";
  rowsUpserted: number;
  error?: string;
  fetchRunId?: string;
};

export type SyncReleasePackageResult = {
  releasePackageId: string;
  releasePackageLabelZh: string;
  packageSyncId: string;
  ok: boolean;
  message: string;
  succeeded: PackageMemberSyncDetail[];
  failed: PackageMemberSyncDetail[];
  skipped: PackageMemberSyncDetail[];
  logs: string[];
};

const SUBSCRIPTION_INCLUDE = {
  source: true,
  instrument: { select: { id: true, code: true, name: true, metadata: true } },
  releasePackage: {
    select: {
      id: true,
      labelZh: true,
      releaseTemplate: true,
      scheduleState: true,
      nextRunAt: true,
    },
  },
} as const;

type TeBatchProvider = "tradingeconomics_ism" | "tradingeconomics_ism_svc";

function readScrapeProvider(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const scrape = (metadata as Record<string, unknown>).scrape;
  if (!scrape || typeof scrape !== "object") return null;
  const provider = (scrape as Record<string, unknown>).provider;
  return typeof provider === "string" ? provider : null;
}

function detectTeBatchProvider(subs: SubscriptionWithRelations[]): TeBatchProvider | null {
  for (const sub of subs) {
    const provider = readScrapeProvider(sub.instrument.metadata);
    if (provider === "tradingeconomics_ism" || provider === "tradingeconomics_ism_svc") {
      return provider;
    }
  }
  return null;
}

function packageFetchMetadata(
  packageSyncId: string,
  batch: TeBatchProvider | "sequential",
  extra?: Record<string, unknown>,
) {
  return {
    packageSyncId,
    batchSync: true,
    batch,
    ...extra,
  };
}

async function finalizePackageCalendar(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  logs: string[],
) {
  try {
    await syncSubscriptionsFromTradingEconomicsCalendar(prisma, {
      subscriptionIds: subs.map((s) => s.id),
    });
    logs.push(`[calendar] 已刷新发布包内 ${subs.length} 条订阅日历`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[calendar] 刷新失败: ${msg}`);
  }

  const pkgId = subs[0]?.releasePackageId;
  if (!pkgId) return;
  const refreshed = await prisma.dataSubscription.findFirst({
    where: { releasePackageId: pkgId, enabled: true },
    orderBy: { nextRunAt: "asc" },
    select: { nextRunAt: true },
  });
  if (refreshed?.nextRunAt) {
    await prisma.releasePackage.update({
      where: { id: pkgId },
      data: { nextRunAt: refreshed.nextRunAt },
    });
  }
}

async function recordBatchFetchFailure(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  packageSyncId: string,
  batch: TeBatchProvider,
  error: string,
  startedAt: Date,
): Promise<PackageMemberSyncDetail[]> {
  const failed: PackageMemberSyncDetail[] = [];
  for (const sub of subs) {
    const run = await prisma.fetchRun.create({
      data: {
        subscriptionId: sub.id,
        startedAt,
        finishedAt: new Date(),
        status: FetchRunStatus.FAILED,
        error: error.slice(0, 2000),
        metadata: packageFetchMetadata(packageSyncId, batch, { phase: "fetch" }),
      },
    });
    await prisma.dataSubscription.update({
      where: { id: sub.id },
      data: { lastError: error.slice(0, 2000) },
    });
    failed.push({
      instrumentCode: sub.instrument.code,
      instrumentName: sub.instrument.name,
      status: "failed",
      rowsUpserted: 0,
      error,
      fetchRunId: run.id,
    });
  }
  return failed;
}

function tePointForSub(
  sub: SubscriptionWithRelations,
  provider: TeBatchProvider,
  parsed: TeIsmParsedPage,
) {
  if (provider === "tradingeconomics_ism") {
    const sector = ismSectorFromInstrumentCode(sub.instrument.code);
    if (!sector) return null;
    return ismSeriesPointForSector(parsed, sector);
  }
  const sector = ismSvcSectorFromInstrumentCode(sub.instrument.code);
  if (!sector) return null;
  return ismSvcSeriesPointForSector(parsed, sector);
}

async function syncTeBatchPackage(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  provider: TeBatchProvider,
  packageSyncId: string,
  logs: string[],
): Promise<Pick<SyncReleasePackageResult, "succeeded" | "failed" | "skipped">> {
  const succeeded: PackageMemberSyncDetail[] = [];
  const failed: PackageMemberSyncDetail[] = [];
  const skipped: PackageMemberSyncDetail[] = [];
  const startedAt = new Date();

  let parsed: TeIsmParsedPage;
  try {
    if (provider === "tradingeconomics_ism") {
      clearTradingEconomicsIsmHtmlCache();
      parsed = await fetchAllTradingEconomicsIsmPoints();
    } else {
      clearTradingEconomicsIsmSvcHtmlCache();
      parsed = await fetchAllTradingEconomicsIsmSvcPoints();
    }
    const headline = parsed.headline?.value;
    logs.push(
      `[fetch] ${provider} 抓取成功 headline=${headline ?? "—"} components=${parsed.components.length}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[fetch] ${provider} 抓取失败: ${msg}`);
    return {
      succeeded,
      failed: await recordBatchFetchFailure(prisma, subs, packageSyncId, provider, msg, startedAt),
      skipped,
    };
  }

  for (const sub of subs) {
    const run = await prisma.fetchRun.create({
      data: {
        subscriptionId: sub.id,
        startedAt,
        status: FetchRunStatus.FAILED,
        metadata: packageFetchMetadata(packageSyncId, provider),
      },
    });

    const teLabel =
      provider === "tradingeconomics_ism"
        ? teLabelForInstrumentCode(sub.instrument.code)
        : teLabelForIsmSvcInstrumentCode(sub.instrument.code);

    try {
      const point = tePointForSub(sub, provider, parsed);
      if (!point) {
        const reason = teLabel ? `TE 页未解析到 ${teLabel}` : "未知仪器代码";
        await prisma.fetchRun.update({
          where: { id: run.id },
          data: {
            finishedAt: new Date(),
            status: FetchRunStatus.SKIPPED,
            error: reason,
            metadata: packageFetchMetadata(packageSyncId, provider, {
              teLabel,
              reason: "no_point",
            }),
          },
        });
        skipped.push({
          instrumentCode: sub.instrument.code,
          instrumentName: sub.instrument.name,
          status: "skipped",
          rowsUpserted: 0,
          error: reason,
          fetchRunId: run.id,
        });
        logs.push(`[skip] ${sub.instrument.code} | ${reason}`);
        continue;
      }

      const { upserted, skipped: rowsSkipped } = await upsertMacroObservations(prisma, sub.instrument.id, [
        { obsDate: point.obsDate, value: point.value },
      ]);

      const status =
        upserted > 0
          ? FetchRunStatus.SUCCESS
          : rowsSkipped > 0
            ? FetchRunStatus.SKIPPED
            : FetchRunStatus.SKIPPED;

      await prisma.dataSubscription.update({
        where: { id: sub.id },
        data: {
          lastObsDate: point.obsDate,
          lastSuccessAt: new Date(),
          lastError: null,
          retryCount: 0,
        },
      });

      await prisma.fetchRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status,
          rowsUpserted: upserted,
          rowsSkipped,
          metadata: packageFetchMetadata(packageSyncId, provider, {
            teLabel,
            obsDate: point.obsDate.toISOString().slice(0, 10),
            value: point.value,
            referenceText: point.referenceText,
          }),
        },
      });

      const memberStatus = upserted > 0 ? "success" : "skipped";
      const detail: PackageMemberSyncDetail = {
        instrumentCode: sub.instrument.code,
        instrumentName: sub.instrument.name,
        status: memberStatus,
        rowsUpserted: upserted,
        fetchRunId: run.id,
      };
      if (memberStatus === "success") succeeded.push(detail);
      else skipped.push(detail);
      logs.push(
        `[ok] ${sub.instrument.code} | ${point.value} | obs=${point.obsDate.toISOString().slice(0, 10)} | +${upserted}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.dataSubscription.update({
        where: { id: sub.id },
        data: { lastError: msg.slice(0, 2000) },
      });
      await prisma.fetchRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: FetchRunStatus.FAILED,
          error: msg.slice(0, 2000),
          metadata: packageFetchMetadata(packageSyncId, provider, { teLabel }),
        },
      });
      failed.push({
        instrumentCode: sub.instrument.code,
        instrumentName: sub.instrument.name,
        status: "failed",
        rowsUpserted: 0,
        error: msg,
        fetchRunId: run.id,
      });
      logs.push(`[fail] ${sub.instrument.code} | ${msg}`);
    }
  }

  await finalizePackageCalendar(prisma, subs, logs);
  return { succeeded, failed, skipped };
}

async function syncSequentialPackage(
  prisma: PrismaClient,
  subs: SubscriptionWithRelations[],
  packageSyncId: string,
  logs: string[],
  force: boolean,
): Promise<Pick<SyncReleasePackageResult, "succeeded" | "failed" | "skipped">> {
  const succeeded: PackageMemberSyncDetail[] = [];
  const failed: PackageMemberSyncDetail[] = [];
  const skipped: PackageMemberSyncDetail[] = [];

  for (const sub of subs) {
    logs.push(`[run] ${sub.instrument.code} 开始`);
    const r = await runDataSubscription(prisma, sub, { force, skipCalendarRefresh: true });
    const detail: PackageMemberSyncDetail = {
      instrumentCode: sub.instrument.code,
      instrumentName: sub.instrument.name,
      status: r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : r.status === "partial" ? "partial" : "success",
      rowsUpserted: r.rowsUpserted,
      error: r.error,
    };

    if (r.status === "failed") {
      failed.push(detail);
      logs.push(`[fail] ${sub.instrument.code} | ${r.error ?? "失败"}`);
    } else if (r.status === "skipped") {
      skipped.push(detail);
      logs.push(`[skip] ${sub.instrument.code} | ${r.error ?? "跳过"}`);
    } else {
      succeeded.push(detail);
      logs.push(`[ok] ${sub.instrument.code} | ${r.status} | +${r.rowsUpserted}`);
    }
  }

  await finalizePackageCalendar(prisma, subs, logs);
  return { succeeded, failed, skipped };
}

async function loadPackageSubscriptions(
  prisma: PrismaClient,
  releasePackageId: string,
): Promise<SubscriptionWithRelations[]> {
  return prisma.dataSubscription.findMany({
    where: { releasePackageId, enabled: true },
    orderBy: { instrument: { code: "asc" } },
    include: SUBSCRIPTION_INCLUDE,
  }) as Promise<SubscriptionWithRelations[]>;
}

export function pickPackageSyncLeaderCode(codes: string[]): string | null {
  if (!codes.length) return null;
  const headline = codes.find((c) => c.includes("_headline"));
  if (headline) return headline;
  return [...codes].sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export async function resolveReleasePackageId(
  prisma: PrismaClient,
  options: { releasePackageId?: string; instrumentCode?: string },
): Promise<string | null> {
  if (options.releasePackageId?.trim()) return options.releasePackageId.trim();
  const code = options.instrumentCode?.trim();
  if (!code) return null;
  const sub = await prisma.dataSubscription.findFirst({
    where: { instrument: { code }, enabled: true },
    select: { releasePackageId: true },
  });
  return sub?.releasePackageId ?? null;
}

export async function syncReleasePackage(
  prisma: PrismaClient,
  options: {
    releasePackageId?: string;
    instrumentCode?: string;
    force?: boolean;
  },
): Promise<SyncReleasePackageResult> {
  const packageSyncId = randomUUID();
  const logs: string[] = [`[package] sync id=${packageSyncId}`];

  const releasePackageId = await resolveReleasePackageId(prisma, options);
  if (!releasePackageId) {
    return {
      releasePackageId: "",
      releasePackageLabelZh: "",
      packageSyncId,
      ok: false,
      message: "未找到发布包",
      succeeded: [],
      failed: [],
      skipped: [],
      logs: [...logs, "[error] 缺少 releasePackageId 或 instrument 无发布包"],
    };
  }

  const pkg = await prisma.releasePackage.findUnique({
    where: { id: releasePackageId },
    select: { id: true, labelZh: true },
  });
  if (!pkg) {
    return {
      releasePackageId,
      releasePackageLabelZh: "",
      packageSyncId,
      ok: false,
      message: `发布包 ${releasePackageId} 不存在`,
      succeeded: [],
      failed: [],
      skipped: [],
      logs: [...logs, `[error] 发布包 ${releasePackageId} 不存在`],
    };
  }

  const subs = await loadPackageSubscriptions(prisma, releasePackageId);
  if (!subs.length) {
    return {
      releasePackageId,
      releasePackageLabelZh: pkg.labelZh,
      packageSyncId,
      ok: false,
      message: `${pkg.labelZh} 无启用订阅`,
      succeeded: [],
      failed: [],
      skipped: [],
      logs: [...logs, `[error] ${pkg.labelZh} 无启用订阅`],
    };
  }

  logs.push(`[package] ${pkg.labelZh} (${releasePackageId}) 成员 ${subs.length} 条`);

  const teBatch = detectTeBatchProvider(subs);
  const { succeeded, failed, skipped } = teBatch
    ? await syncTeBatchPackage(prisma, subs, teBatch, packageSyncId, logs)
    : await syncSequentialPackage(prisma, subs, packageSyncId, logs, options.force ?? true);

  const ok = failed.length === 0;
  const message = ok
    ? `${pkg.labelZh}：成功 ${succeeded.length}，跳过 ${skipped.length}`
    : `${pkg.labelZh}：成功 ${succeeded.length}，失败 ${failed.length}，跳过 ${skipped.length}`;

  logs.push(`[done] ${message}`);

  return {
    releasePackageId,
    releasePackageLabelZh: pkg.labelZh,
    packageSyncId,
    ok,
    message,
    succeeded,
    failed,
    skipped,
    logs,
  };
}

/**
 * 将开发机已验证的中国官方宏观观测复制到另一 PostgreSQL 库。
 *
 * 设计为大陆临时采集器的安全回填工具：源库只从本地 .env.local 读取，
 * 目标库必须显式经 TARGET_DATABASE_URL 传入（例如 SSH 本地端口转发）。
 * 不复制订阅、密钥或用户数据；只 upsert 已在目标库 seed 的 NBS / 财政部观测。
 *
 * npm run data:copy-local-cn-to-target -- --dry-run
 * $env:TARGET_DATABASE_URL = $env:DATABASE_URL; npm run data:copy-local-cn-to-target
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";

const PREFIXES = ["nbs_cn_", "mof_cn_fiscal_"] as const;

function localDatabaseUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  const line = env.split(/\r?\n/).find((value) => value.startsWith("DATABASE_URL="));
  const value = line?.slice("DATABASE_URL=".length).trim().replace(/^(?:"|')|(?:"|')$/g, "");
  if (!value?.match(/^postgres(?:ql)?:\/\//)) throw new Error(".env.local 缺少有效的本机 DATABASE_URL");
  return value;
}

function inScope(code: string) {
  return PREFIXES.some((prefix) => code.startsWith(prefix));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const source = new PrismaClient({ datasources: { db: { url: localDatabaseUrl() } } });
  const targetUrl = process.env.TARGET_DATABASE_URL;
  const target = dryRun ? null : new PrismaClient({ datasources: { db: { url: targetUrl } } });

  if (!dryRun && !targetUrl?.match(/^postgres(?:ql)?:\/\//)) {
    throw new Error("请设置 TARGET_DATABASE_URL 为 SSH 隧道对应的云端 PostgreSQL URL");
  }

  try {
    const sourceInstruments = await source.instrument.findMany({
      where: { OR: PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) },
      select: {
        id: true, code: true, kind: true, name: true, nameEn: true, shortName: true,
        description: true, freqLabel: true, unit: true, externalRefs: true, metadata: true,
        dataSubscription: {
          select: { sourceId: true, sourceSeriesKey: true, fetchMethod: true, granularity: true, releaseRule: true, nextRunAt: true, enabled: true, priority: true },
        },
      },
      orderBy: { code: "asc" },
    });
    const sourceIds = sourceInstruments.map((item) => item.id);
    const observations = await source.macroObservation.findMany({
      where: { instrumentId: { in: sourceIds } },
      select: { instrumentId: true, obsDate: true, value: true },
      orderBy: [{ instrumentId: "asc" }, { obsDate: "asc" }],
    });
    console.log(`[copy-local-cn] 源库中国官方序列=${sourceInstruments.length}，观测=${observations.length}`);

    if (dryRun) return;
    const targetInstruments = await target!.instrument.findMany({
      where: { OR: PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) },
      select: { id: true, code: true },
    });
    const targetIdByCode = new Map(targetInstruments.filter((item) => inScope(item.code)).map((item) => [item.code, item.id]));
    const missing = sourceInstruments.filter((item) => !targetIdByCode.has(item.code));
    if (missing.length) {
      console.log(`[copy-local-cn] 云库缺少 ${missing.length} 条动态指标定义，正在从本机幂等补齐…`);
      for (const item of missing) {
        const created = await target!.instrument.create({
          data: {
            code: item.code, kind: item.kind, name: item.name, nameEn: item.nameEn,
            shortName: item.shortName, description: item.description, freqLabel: item.freqLabel,
            unit: item.unit, externalRefs: item.externalRefs ?? undefined, metadata: item.metadata ?? undefined,
          },
          select: { id: true },
        });
        targetIdByCode.set(item.code, created.id);
        if (item.dataSubscription) {
          await target!.dataSubscription.upsert({
            where: { instrumentId: created.id },
            create: {
              instrumentId: created.id, sourceId: item.dataSubscription.sourceId,
              sourceSeriesKey: item.dataSubscription.sourceSeriesKey, fetchMethod: item.dataSubscription.fetchMethod,
              granularity: item.dataSubscription.granularity, releaseRule: item.dataSubscription.releaseRule ?? undefined,
              nextRunAt: item.dataSubscription.nextRunAt, enabled: item.dataSubscription.enabled, priority: item.dataSubscription.priority,
            },
            update: {},
          });
        }
      }
    }

    const pointsBySourceId = new Map<string, typeof observations>();
    for (const point of observations) pointsBySourceId.set(point.instrumentId, [...(pointsBySourceId.get(point.instrumentId) ?? []), point]);

    let upserted = 0;
    let completed = 0;
    for (const instrument of sourceInstruments) {
      const points = pointsBySourceId.get(instrument.id) ?? [];
      if (points.length) {
        const result = await upsertMacroObservations(target!, targetIdByCode.get(instrument.code)!, points);
        upserted += result.upserted;
      }
      completed++;
      if (completed % 50 === 0 || completed === sourceInstruments.length) {
        console.log(`[copy-local-cn] 已处理 ${completed}/${sourceInstruments.length}，新增或修订=${upserted}`);
      }
    }
    console.log(`[copy-local-cn] 完成：新增或修订=${upserted}`);
  } finally {
    await source.$disconnect();
    await target?.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

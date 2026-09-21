/**
 * 核对 FRED 订阅的 `granularity` 与 FRED 源端 `frequency` 是否一致。
 *
 * 为什么重要（不只是显示问题）：
 * 1. `macroAsOf.ts` 用 granularity 推「周期末 + 典型发布滞后」来近似 PIT 可见性。
 *    季频序列被标成 MONTHLY，周期末会早算两个月、lagDays 又从 45 掉到 15，
 *    合计让该值提前约 90 天「可见」——**回测直接吃到前视偏差**。
 * 2. 陈旧度体检按 granularity 取阈值，错标会长期刷假警报（月频阈值 120 天套在
 *    季频序列上，正常的 Q2 数据会被报成「落后 172 天」），假警报多了就没人看。
 * 3. `defaultReleaseRuleForGranularity()` 也按它决定默认探测节奏。
 *
 * npm run data:verify-fred-granularity
 * npm run data:verify-fred-granularity -- --fix          # 按源端改正 granularity
 * npm run data:verify-fred-granularity -- --fix --freq-label   # 连带改正 freqLabel
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient, type DataGranularity } from "@prisma/client";
import { getFredRateLimiter } from "../../src/lib/data/scheduler/fredRateLimiter";
import { granularityFromFredFrequency } from "../../src/lib/data/scheduler/adapters/fredAdapter";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

/** granularity → freqLabel 的既有中文约定 */
const FREQ_LABEL: Partial<Record<DataGranularity, string>> = {
  DAILY: "日",
  WEEKLY: "周",
  MONTHLY: "月",
  QUARTERLY: "季",
  ANNUAL: "年",
};

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function fredFrequency(
  seriesId: string,
  apiKey: string,
): Promise<{ frequency?: string; frequencyShort?: string } | null> {
  const url =
    `https://api.stlouisfed.org/fred/series?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(apiKey)}&file_type=json`;
  const res = await getFredRateLimiter().fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    seriess?: Array<{ frequency?: string; frequency_short?: string }>;
  };
  const first = json.seriess?.[0];
  if (!first) return null;
  return { frequency: first.frequency, frequencyShort: first.frequency_short };
}

async function main() {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 FRED_API_KEY");
  const fix = argFlag("fix");
  const alsoFreqLabel = argFlag("freq-label");

  const subs = await prisma.dataSubscription.findMany({
    where: { sourceId: "fred", enabled: true },
    select: {
      id: true,
      granularity: true,
      sourceSeriesKey: true,
      instrument: { select: { id: true, code: true, name: true, fredSeriesId: true, freqLabel: true } },
    },
    orderBy: { instrument: { code: "asc" } },
  });

  console.log(`[verify-fred-granularity] 核对 ${subs.length} 条 FRED 订阅…`);

  const mismatches: Array<{
    code: string;
    seriesId: string;
    dbGranularity: DataGranularity;
    srcGranularity: DataGranularity;
    srcFrequency: string;
    freqLabel: string | null;
  }> = [];
  const unresolved: string[] = [];

  for (const sub of subs) {
    const seriesId = sub.instrument.fredSeriesId?.trim() || sub.sourceSeriesKey?.trim();
    if (!seriesId) {
      unresolved.push(`${sub.instrument.code}（无 fredSeriesId / sourceSeriesKey）`);
      continue;
    }
    const meta = await fredFrequency(seriesId, apiKey);
    if (!meta?.frequency) {
      unresolved.push(`${sub.instrument.code}（FRED 查不到 ${seriesId}）`);
      continue;
    }
    const srcGranularity = granularityFromFredFrequency(meta.frequency);
    // IRREGULAR 说明映射没认出这个频率，别拿它去覆盖人工设定的值。
    if (srcGranularity === "IRREGULAR") {
      unresolved.push(`${sub.instrument.code}（频率「${meta.frequency}」未被映射识别）`);
      continue;
    }
    if (srcGranularity !== sub.granularity) {
      mismatches.push({
        code: sub.instrument.code,
        seriesId,
        dbGranularity: sub.granularity,
        srcGranularity,
        srcFrequency: meta.frequency,
        freqLabel: sub.instrument.freqLabel,
      });
      if (fix) {
        await prisma.dataSubscription.update({
          where: { id: sub.id },
          data: { granularity: srcGranularity },
        });
        const wantLabel = FREQ_LABEL[srcGranularity];
        if (alsoFreqLabel && wantLabel && sub.instrument.freqLabel !== wantLabel) {
          await prisma.instrument.update({
            where: { id: sub.instrument.id },
            data: { freqLabel: wantLabel },
          });
        }
      }
    }
  }

  if (mismatches.length === 0) {
    console.log("[verify-fred-granularity] 全部一致 ✓");
  } else {
    console.log(`\n${fix ? "已改正" : "不一致"} ${mismatches.length} 条：`);
    for (const m of mismatches) {
      const label = FREQ_LABEL[m.srcGranularity];
      const labelNote =
        label && m.freqLabel !== label ? `，freqLabel「${m.freqLabel ?? "空"}」应为「${label}」` : "";
      console.log(
        `  ${m.code} (${m.seriesId}): 库=${m.dbGranularity} → 源=${m.srcGranularity}` +
          `（FRED frequency=「${m.srcFrequency}」）${labelNote}`,
      );
    }
  }

  if (unresolved.length > 0) {
    console.log(`\n无法判定 ${unresolved.length} 条（不改动）：`);
    for (const u of unresolved.slice(0, 20)) console.log(`  · ${u}`);
    if (unresolved.length > 20) console.log(`  … 另有 ${unresolved.length - 20} 条`);
  }

  console.log(
    `\n[verify-fred-granularity] 共 ${subs.length} 条，不一致 ${mismatches.length}，无法判定 ${unresolved.length}` +
      (fix ? "（已写回）" : mismatches.length > 0 ? "（只读，加 --fix 写回）" : ""),
  );
  if (!fix && mismatches.length > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

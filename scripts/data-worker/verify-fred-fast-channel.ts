/**
 * FRED 官方首发渠道——复核（联网，无需数据库）
 *
 * npm run data:verify-fred-fast-channel
 *
 * 对 FRED_FAST_CHANNELS 的每条映射：取 FRED 与官方渠道自 2024-01-01 起的全部观测，
 * 要求重叠日**逐日相等**（差 > 0.001 即失败），且官方渠道最新日期不早于 FRED。
 * 任何一条不相等都说明官方渠道不能当成同一序列写进 sched_fred_*，必须从映射里删掉。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { fetchFredIncremental } from "../../src/lib/data/scheduler/adapters/fredAdapter";
import { FRED_FAST_CHANNELS } from "../../src/lib/data/scheduler/fredFastChannel/catalog";
import { fetchFastChannelPointsAfter } from "../../src/lib/data/scheduler/fredFastChannel/fetchFastChannel";

const START = "2024-01-01";
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 FRED_API_KEY");
  let errors = 0;
  for (const [seriesId, channel] of Object.entries(FRED_FAST_CHANNELS)) {
    try {
      const fred = await fetchFredIncremental(seriesId, apiKey, START);
      const alt = await fetchFastChannelPointsAfter(channel, "2023-12-31");
      const altByDate = new Map(alt.map((p) => [iso(p.obsDate), p.value]));
      let overlap = 0;
      const diffs: string[] = [];
      for (const p of fred.points) {
        const v = altByDate.get(iso(p.obsDate));
        if (v == null) continue;
        overlap++;
        if (Math.abs(v - p.value) > 0.001) diffs.push(`${iso(p.obsDate)} FRED=${p.value} 官方=${v}`);
      }
      const fredLast = fred.sourceLatestObsDate ? iso(fred.sourceLatestObsDate) : "无";
      const altLast = alt.length ? iso(alt[alt.length - 1]!.obsDate) : "无";
      if (overlap < 200 || diffs.length > 0 || altLast < fredLast) {
        errors++;
        console.error(
          `  ✗ ${seriesId} ← ${channel.label}：重叠 ${overlap} 天、不等 ${diffs.length} 天 ${diffs.slice(0, 3).join("；")}` +
            `，FRED 最新 ${fredLast} / 官方 ${altLast}`,
        );
      } else {
        console.log(`  ✓ ${seriesId} ← ${channel.label}：重叠 ${overlap} 天全部相等；FRED ${fredLast} / 官方 ${altLast}`);
      }
    } catch (error) {
      errors++;
      console.error(`  ✗ ${seriesId}：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (errors > 0) {
    console.error(`[verify-fred-fast-channel] 失败：${errors} 条`);
    process.exit(1);
  }
  console.log("[verify-fred-fast-channel] 通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

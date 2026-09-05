/**
 * AAR 美国铁路周度装车量/多式联运量——全量抓取/回填（支持 --fixture 离线）
 *
 * npm run data:sync-aar-rail-traffic
 *   回填：分页遍历归档列表（/aar_news/weekly-rail-traffic-data/page/{n}/），
 *   收集 weekEndingDate >= 2019-01-01 的条目，逐篇抓正文解析，限速 1.5s/请求；
 *   已入库的 obsDate 会被 upsert 跳过重复请求判断留给下次运行前先查 DB 已有范围
 *   （--resume，默认开启：从上次已知最新观测日之后继续，可安全中断重跑）。
 * npm run data:sync-aar-rail-traffic -- --no-resume（忽略已存在数据，强制全量重抓）
 * npm run data:sync-aar-rail-traffic -- --max-pages=5（只抓前 5 页，用于快速验证）
 * npm run data:sync-aar-rail-traffic -- --fixture-list=.data/aar-weekly-traffic-archive-page1-sample.html --fixture-detail=.data/aar-weekly-traffic-week-sample.html
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import {
  AAR_RAIL_TRAFFIC_FIRST_WEEK_ENDING,
  AAR_RAIL_TRAFFIC_SERIES,
} from "../../src/lib/data/scheduler/aarRailTraffic/catalog";
import {
  fetchAarArchiveListPage,
  fetchAarWeeklyReleasePage,
} from "../../src/lib/data/scheduler/aarRailTraffic/client";
import {
  parseAarArchiveListPage,
  parseAarArchiveMaxPage,
  parseAarWeeklyReleasePage,
} from "../../src/lib/data/scheduler/aarRailTraffic/parseWeeklyTraffic";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import type { ObservationPoint } from "../../src/lib/data/scheduler/types";

const prisma = new PrismaClient();

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${prefix}=`))?.split("=").slice(1).join("=");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const fixtureList = argValue("fixture-list");
  const fixtureDetail = argValue("fixture-detail");
  const maxPagesArg = argValue("max-pages");
  const noResume = process.argv.includes("--no-resume");
  const firstWeekEnding = new Date(`${AAR_RAIL_TRAFFIC_FIRST_WEEK_ENDING}T00:00:00.000Z`);

  const insts = new Map<string, { id: string }>();
  for (const row of AAR_RAIL_TRAFFIC_SERIES) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.instrumentCode } });
    if (!inst) {
      throw new Error(`未找到仪器 ${row.instrumentCode}，请先 npm run data:seed-aar-rail-traffic`);
    }
    insts.set(row.instrumentCode, { id: inst.id });
  }

  // resume：以 carloads 仪器已有的最新观测日为下界，避免重复抓取整段历史
  let resumeFrom = firstWeekEnding;
  if (!noResume) {
    const carloadsInst = insts.get("aar_us_rail_carloads_weekly")!;
    const latest = await prisma.macroObservation.findFirst({
      where: { instrumentId: carloadsInst.id },
      orderBy: { obsDate: "desc" },
    });
    if (latest && latest.obsDate > resumeFrom) {
      // 从已知最新观测日的下一周开始（留 1 天缓冲避免跳过同一周）
      resumeFrom = new Date(latest.obsDate.getTime() + 24 * 3600 * 1000);
    }
  }
  console.log(
    `[sync-aar-rail-traffic] 回填起点 ${resumeFrom.toISOString().slice(0, 10)}（--no-resume=${noResume}）`,
  );

  // 第 1 页确定总页数
  const firstListHtml = await fetchAarArchiveListPage(1, { fixturePath: fixtureList });
  const declaredMaxPage = parseAarArchiveMaxPage(firstListHtml);
  const maxPages = maxPagesArg ? Math.min(Number(maxPagesArg), declaredMaxPage) : declaredMaxPage;
  console.log(`[sync-aar-rail-traffic] 归档共 ${declaredMaxPage} 页，本次遍历至第 ${maxPages} 页`);

  const targets: { url: string; weekEndingDate: Date }[] = [];
  let page = 1;
  let stop = false;
  while (page <= maxPages && !stop) {
    const html = page === 1 ? firstListHtml : await fetchAarArchiveListPage(page, { fixturePath: fixtureList });
    const items = parseAarArchiveListPage(html);
    for (const item of items) {
      if (!item.weekEndingDate) continue; // 旧格式标题（"WEEK OF..."），跳过不纳入
      if (item.weekEndingDate < firstWeekEnding) {
        stop = true; // 列表按时间倒序，遇到早于回填下限的条目即可停止翻页
        continue;
      }
      if (item.weekEndingDate < resumeFrom) {
        // 列表按时间倒序：遇到第一条已回填过的条目，其后（更早）的也必已回填过，可直接停止翻页
        stop = true;
        continue;
      }
      targets.push({ url: item.url, weekEndingDate: item.weekEndingDate });
    }
    console.log(`[sync-aar-rail-traffic] 第 ${page} 页：累计目标 ${targets.length} 条`);
    page += 1;
    if (!fixtureList && page <= maxPages && !stop) await sleep(1500);
  }

  console.log(`[sync-aar-rail-traffic] 待抓正文 ${targets.length} 篇`);

  const pointsBySeries = new Map<string, ObservationPoint[]>(
    AAR_RAIL_TRAFFIC_SERIES.map((r) => [r.instrumentCode, []]),
  );
  let skippedInvalid = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    try {
      const detailHtml = await fetchAarWeeklyReleasePage(target.url, {
        fixturePath: fixtureDetail,
      });
      const parsed = parseAarWeeklyReleasePage(detailHtml);
      for (const row of AAR_RAIL_TRAFFIC_SERIES) {
        const value = row.seriesKey === "carloads" ? parsed.carloads : parsed.intermodal;
        const [lo, hi] = row.valueRange;
        if (value < lo || value > hi) {
          throw new Error(`${row.seriesKey} 值 ${value} 超出值域 [${lo},${hi}]`);
        }
        pointsBySeries.get(row.instrumentCode)!.push({ obsDate: parsed.weekEndingDate, value });
      }
    } catch (e) {
      skippedInvalid += 1;
      console.error(
        `[sync-aar-rail-traffic] ✗ 跳过 ${target.url}（${target.weekEndingDate.toISOString().slice(0, 10)}）：${e instanceof Error ? e.message : e}`,
      );
    }
    if ((i + 1) % 10 === 0 || i === targets.length - 1) {
      console.log(`[sync-aar-rail-traffic] 进度 ${i + 1}/${targets.length}`);
    }
    if (!fixtureDetail && i < targets.length - 1) await sleep(1500);
  }

  for (const row of AAR_RAIL_TRAFFIC_SERIES) {
    const points = pointsBySeries.get(row.instrumentCode)!;
    const inst = insts.get(row.instrumentCode)!;
    const { upserted, skipped } = await upsertMacroObservations(prisma, inst.id, points);
    console.log(
      `[sync-aar-rail-traffic] ${row.instrumentCode} 完成：抓取 ${points.length} 点，upserted=${upserted} skipped=${skipped}`,
    );
  }
  console.log(`[sync-aar-rail-traffic] 全部完成：正文解析失败/跳过 ${skippedInvalid} 篇`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

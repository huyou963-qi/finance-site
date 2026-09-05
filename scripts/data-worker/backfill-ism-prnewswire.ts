/**
 * PR Newswire ISM 新闻稿——历史回填（官网 SSO 墙不可用时的深度兜底；支持 --fixture 离线）
 *
 * 背景：ISM 官网 2026-09 起对所有报告页返回 302 到 SSO 登录，导致
 * customers_inventories/new_export_orders/imports（制造业）、
 * supplier_deliveries/inventories/backlog/new_export_orders/imports/inventory_sentiment（服务业）
 * 等此前无 TE 兜底的分项停止更新。这些分项在官网正常时已有完整历史，本脚本只需补上
 * SSO 墙出现之后的缺口，而非重新抓取多年历史——因此默认按"覆盖最差的目标仪器"
 * 的最新观测日作为回填下界（resume），只翻到该下界即止。
 *
 * npm run data:backfill-ism-prnewswire
 * npm run data:backfill-ism-prnewswire -- --max-pages=5
 * npm run data:backfill-ism-prnewswire -- --no-resume（忽略已有数据，翻到 --max-pages 上限为止）
 * npm run data:backfill-ism-prnewswire -- --fixture-list=<列表页fixture> --fixture-detail=<正文fixture>（离线单页调试）
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { PrismaClient } from "@prisma/client";
import {
  ISM_OFFICIAL_MFG_SERIES,
  ISM_OFFICIAL_SVC_SERIES,
  type IsmOfficialSeriesDef,
} from "../../src/lib/data/scheduler/ismOfficial/catalog";
import {
  loadPrNewswireHtml,
  loadPrNewswireListPageHtml,
} from "../../src/lib/data/scheduler/ismOfficial/prNewswire/client";
import {
  parsePrNewswireListPage,
  type PrNewswireListEntry,
} from "../../src/lib/data/scheduler/ismOfficial/prNewswire/parseList";
import { parsePrNewswireReport } from "../../src/lib/data/scheduler/ismOfficial/prNewswire/parseReport";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
import type { ObservationPoint } from "../../src/lib/data/scheduler/types";

const prisma = new PrismaClient();
const ALL_SERIES: readonly IsmOfficialSeriesDef[] = [
  ...ISM_OFFICIAL_MFG_SERIES,
  ...ISM_OFFICIAL_SVC_SERIES,
];

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
  const maxPages = maxPagesArg ? Number(maxPagesArg) : 24;
  const noResume = process.argv.includes("--no-resume");

  const prSeries = ALL_SERIES.filter((s) => s.prNewswireLabel);
  const insts = new Map<string, { id: string }>();
  for (const row of prSeries) {
    const inst = await prisma.instrument.findUnique({ where: { code: row.code } });
    if (!inst) {
      console.warn(`[skip] 未找到仪器 ${row.code}（先 seed），本次回填跳过该分项`);
      continue;
    }
    insts.set(row.code, { id: inst.id });
  }
  if (!insts.size) throw new Error("未找到任何目标仪器，请先确认 seed 已完成");

  let resumeFrom: Date | null = null;
  if (!noResume) {
    let worst: Date | null | undefined;
    for (const inst of insts.values()) {
      const latest = await prisma.macroObservation.findFirst({
        where: { instrumentId: inst.id },
        orderBy: { obsDate: "desc" },
      });
      const d = latest?.obsDate ?? null;
      if (d === null) {
        worst = null;
        break; // 有仪器完全没数据：不设下界，全量回填（受 --max-pages 限制）
      }
      if (worst === undefined || d < worst) worst = d;
    }
    resumeFrom = worst ?? null;
  }
  console.log(
    `[backfill-ism-prnewswire] resumeFrom=${resumeFrom ? resumeFrom.toISOString().slice(0, 10) : "(none，全量)"} maxPages=${maxPages}`,
  );

  const targets: PrNewswireListEntry[] = [];
  const seenKeys = new Set<string>();
  let page = 1;
  let stop = false;
  while (page <= maxPages && !stop) {
    const html = await loadPrNewswireListPageHtml(page, { fixturePath: fixtureList });
    let entries: PrNewswireListEntry[];
    try {
      entries = parsePrNewswireListPage(html);
    } catch (e) {
      if (page === 1) throw e; // 第 1 页必须解析成功，否则页面结构已变，不能静默放弃
      console.log(`[backfill-ism-prnewswire] 第 ${page} 页无法解析（视为翻到头），停止翻页`);
      break;
    }
    let newOnThisPage = 0;
    for (const entry of entries) {
      const key = `${entry.kind}:${entry.year}-${entry.month}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      newOnThisPage += 1;
      const entryDate = new Date(Date.UTC(entry.year, entry.month - 1, 1));
      if (resumeFrom && entryDate <= resumeFrom) {
        stop = true; // 列表倒序：遇到已回填月份即可停止翻页
        continue;
      }
      targets.push(entry);
    }
    console.log(
      `[backfill-ism-prnewswire] 第 ${page} 页：新增候选 ${newOnThisPage}，累计目标 ${targets.length}`,
    );
    if (newOnThisPage === 0) break; // 翻到头（无更多新内容）
    page += 1;
    if (!fixtureList && page <= maxPages && !stop) await sleep(1500);
  }

  console.log(`[backfill-ism-prnewswire] 待抓正文 ${targets.length} 篇`);

  const pointsBySeries = new Map<string, ObservationPoint[]>(prSeries.map((r) => [r.code, []]));
  let skippedInvalid = 0;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    try {
      const html = await loadPrNewswireHtml({ url: target.url, fixturePath: fixtureDetail });
      const parsed = parsePrNewswireReport(html, target.kind);
      for (const row of prSeries) {
        if (row.kind !== target.kind) continue;
        const point = parsed.pointsByCode.get(row.code);
        if (!point) continue;
        pointsBySeries.get(row.code)!.push(point);
      }
    } catch (e) {
      skippedInvalid += 1;
      console.error(
        `[backfill-ism-prnewswire] ✗ 跳过 ${target.url}（${target.kind} ${target.year}-${String(target.month).padStart(2, "0")}）：${e instanceof Error ? e.message : e}`,
      );
    }
    if ((i + 1) % 5 === 0 || i === targets.length - 1) {
      console.log(`[backfill-ism-prnewswire] 进度 ${i + 1}/${targets.length}`);
    }
    if (!fixtureDetail && i < targets.length - 1) await sleep(1500);
  }

  let totalUpserted = 0;
  for (const row of prSeries) {
    const inst = insts.get(row.code);
    if (!inst) continue;
    const points = pointsBySeries.get(row.code)!;
    if (!points.length) continue;
    const { upserted } = await upsertMacroObservations(prisma, inst.id, points);
    totalUpserted += upserted;
    console.log(`[backfill-ism-prnewswire] ${row.code}：+${upserted}（共 ${points.length} 点）`);
  }
  console.log(
    `[backfill-ism-prnewswire] 完成：篇数=${targets.length} 跳过=${skippedInvalid} 写入=${totalUpserted}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

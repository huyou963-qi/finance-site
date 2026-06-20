/**
 * Phase 1 自检：环境、HTML 解析、可选日历拉取与 DB
 *
 * npm run data:verify-phase1
 * npm run data:verify-phase1 -- --fetch
 * npm run data:verify-phase1 -- --db
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { parseInvestingCalendarHtml } from "../../src/lib/data/scheduler/investingCalendar/parseHtml";
import {
  defaultCalendarWindow,
  fetchInvestingEconomicCalendar,
} from "../../src/lib/data/scheduler/investingCalendar/client";
import { findNextCalendarRelease } from "../../src/lib/data/scheduler/investingEventMap";

loadEnvConfig(process.cwd());

const SAMPLE_HTML = `
<tr event_attr_ID="999" data-event-datetime="2026/06/15 12:30:00">
  <td class="flagCur"><span title="USA">USD</span></td>
  <td class="event"><a href="#">US CPI (MoM)</a></td>
</tr>`;

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg: string) {
  console.warn(`  ⚠ ${msg}`);
}

function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
}

async function main() {
  const doFetch = process.argv.includes("--fetch");
  const doDb = process.argv.includes("--db");
  let errors = 0;

  console.log("[verify-phase1] 环境变量");
  if (process.env.DATABASE_URL?.trim()) ok("DATABASE_URL 已配置");
  else warn("DATABASE_URL 未配置（sync/worker 需要）");

  if (process.env.FRED_API_KEY?.trim()) ok("FRED_API_KEY 已配置");
  else warn("FRED_API_KEY 未配置（worker 无法拉 FRED）");

  if (process.env.INVESTING_CALENDAR_COOKIE?.trim()) ok("INVESTING_CALENDAR_COOKIE 已配置");
  else warn("INVESTING_CALENDAR_COOKIE 未配置（日历可能 403，将回退间隔探测）");

  console.log("[verify-phase1] HTML 解析");
  const parsed = parseInvestingCalendarHtml(SAMPLE_HTML);
  if (parsed.length === 1 && parsed[0].eventId === "999") {
    ok("样例 CPI 行解析成功");
  } else {
    fail(`解析异常: ${JSON.stringify(parsed)}`);
    errors++;
  }

  const cpiSpec = {
    countryCodes: ["US"],
    keywords: ["cpi"],
    excludeKeywords: ["core"],
  };
  const cpiHit = findNextCalendarRelease(parsed, cpiSpec, new Date("2026-06-01"));
  if (cpiHit?.title.includes("CPI")) ok("CPI 关键词匹配成功");
  else {
    fail("CPI 关键词匹配失败");
    errors++;
  }

  if (doFetch) {
    console.log("[verify-phase1] 拉取 Investing 日历（--fetch）");
    const result = await fetchInvestingEconomicCalendar(defaultCalendarWindow());
    console.log(`  事件 ${result.events.length} 条，来源 ${result.source}`);
    if (result.warning) warn(result.warning);
    if (result.events.length === 0) {
      warn("未拉到事件；生产环境请配置 Cookie 或使用 fallback");
    } else {
      ok(`前 3 条: ${result.events.slice(0, 3).map((e) => e.title).join(" | ")}`);
    }
  }

  if (doDb) {
    console.log("[verify-phase1] 数据库订阅");
    const prisma = new PrismaClient();
    try {
      const n = await prisma.dataSubscription.count({ where: { enabled: true } });
      ok(`enabled 订阅 ${n} 条`);
      if (n === 0) warn("请先 npm run data:seed-p0");
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      errors++;
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(
    errors === 0
      ? "[verify-phase1] 通过（加 --fetch / --db 做更深检查）"
      : `[verify-phase1] 失败 ${errors} 项`,
  );
  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

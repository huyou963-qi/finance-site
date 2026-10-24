import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { MARKET_INTERNALS_SERIES } from "../../src/lib/data/scheduler/marketInternals/catalog";
import { buildDailyBreadth } from "../../src/lib/data/scheduler/marketInternals/client";
import { replacementThrough } from "../../src/lib/data/scheduler/marketInternals/compute";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import { mkdir, writeFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const cachedPrices = process.argv.includes("--cached-prices");
  const styleOnly = process.argv.includes("--style-only");
  const breadthOnly = process.argv.includes("--breadth-only");
  const replaceHistory = process.argv.includes("--replace-history");
  if (replaceHistory && !cachedPrices) throw new Error("全历史重算清理须加 --cached-prices，先完成历史价格回填");
  // 初始历史回填可显式只读既有行情，避免重复抓取500只证券；日常worker仍自动更新行情。
  const breadth = cachedPrices && !styleOnly ? await buildDailyBreadth("1995-01-01", { live: !process.argv.includes("--packaged-membership"), refreshPrices: false }) : null;
  if (replaceHistory && breadth?.membershipCorroborated) throw new Error("SPY独立校验只确认持仓日，不能据此清理其他日期的历史观测；请在完整指数名单源恢复后重算清理");
  for (const row of MARKET_INTERNALS_SERIES) {
    if (styleOnly && row.source === "breadth") continue;
    if (breadthOnly && row.source !== "breadth") continue;
    const sub = await prisma.dataSubscription.findFirst({ where: { instrument: { code: row.code } }, include: { source: true, instrument: true, releasePackage: true } });
    if (!sub) throw new Error(`请先seed: ${row.code}`);
    const result = await runDataSubscription(prisma, cachedPrices ? { ...sub, revisionLookback: 1000 } : sub, { force: true, skipCalendarRefresh: true,
      ...(breadth && row.source === "breadth" ? { fetchIncremental: async () => {
        const existing = replaceHistory ? [] : await prisma.macroObservation.findMany({ where: { instrumentId: sub.instrumentId }, select: { obsDate: true } });
        const stored = new Set(existing.map(r => r.obsDate.toISOString().slice(0, 10)));
        const available = breadth.rows.filter((r) => r.values[row.key] != null);
        const points = available.filter((r) => !stored.has(r.date)).map((r) => ({ obsDate: new Date(`${r.date}T00:00:00Z`), value: r.values[row.key]! }));
        return { points, sourceLatestObsDate: available.length ? new Date(`${available.at(-1)!.date}T00:00:00Z`) : null, skippedInvalid: 0, sourceMetadata: { membershipAnchor: breadth.anchor, membershipSource: breadth.source, cachedPricesOnly: true } };
      } } : {}),
    });
    console.log(row.code, result);
    if (result.status === "failed") process.exitCode = 1;
    if (replaceHistory && breadth && row.source === "breadth" && result.status !== "failed") {
      const validDates = breadth.rows.filter((r) => r.values[row.key] != null).map((r) => new Date(`${r.date}T00:00:00Z`));
      if (!validDates.length) throw new Error(`${row.code}没有有效重算值，不清理旧数据`);
      const through = replacementThrough(breadth.anchor, breadth.calendarThrough);
      if (!through) throw new Error("重算范围为空，不清理旧数据");
      const obsolete = await prisma.macroObservation.findMany({ where: { instrumentId: sub.instrumentId, obsDate: { lte: new Date(`${through}T00:00:00Z`), notIn: validDates } } });
      if (obsolete.length) {
        await mkdir(".data/market-breadth-sources", { recursive: true });
        await writeFile(`.data/market-breadth-sources/${row.code}-retired-${Date.now()}.json`, JSON.stringify({ reason: "历史名单/价格核验后不再满足覆盖门槛，备份后移除旧计算值", rows: obsolete }, null, 2));
        const deleted = await prisma.macroObservation.deleteMany({ where: { instrumentId: sub.instrumentId, obsDate: { in: obsolete.map((r) => r.obsDate) } } });
        console.log(`${row.code} 已备份并清理旧无效观测 ${deleted.count}`);
      }
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

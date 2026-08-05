/** 国家统计局 GDP 全历史回填；按数据目录与频率分组，避免逐指标请求。 */
import { loadEnvConfig } from "@next/env"; import { PrismaClient } from "@prisma/client";
import { fetchNbsGdpGroup } from "../../src/lib/data/scheduler/nbsGdp/client";
import { NBS_GDP_SERIES, type GdpSeries } from "../../src/lib/data/scheduler/nbsGdp/catalog";
import { upsertMacroObservations } from "../../src/lib/data/scheduler/upsertObservations";
loadEnvConfig(process.cwd()); const prisma = new PrismaClient();
async function main() {
  const groups = new Map<string, GdpSeries[]>(); for (const item of NBS_GDP_SERIES) { const key = `${item.frequency}:${item.cid}`; groups.set(key, [...(groups.get(key) ?? []), item]); }
  const history = new Map<string, Awaited<ReturnType<typeof fetchNbsGdpGroup>>>();
  for (const [key, items] of groups) history.set(key, await fetchNbsGdpGroup(items, items[0]!.frequency === "quarterly" ? 1992 : 1952));
  let upserted = 0;
  for (const item of NBS_GDP_SERIES) { const instrument = await prisma.instrument.findUnique({ where: { code: item.code }, select: { id: true } }); if (!instrument) throw new Error(`未找到 ${item.code}，请先 seed`); const points = history.get(`${item.frequency}:${item.cid}`)?.get(item.indicatorId) ?? []; const result = await upsertMacroObservations(prisma, instrument.id, points); upserted += result.upserted; console.log(`  ${item.code} points=${points.length} upserted=${result.upserted}`); }
  console.log(`[data:sync-nbs-gdp] 完成：upserted=${upserted}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

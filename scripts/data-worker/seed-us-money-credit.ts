import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { US_MONEY_CREDIT_SERIES, moneyCreditNotes, moneyCreditRule } from "../../src/lib/data/scheduler/usMoneyCreditCatalog";
import { computeNextRunAt } from "../../src/lib/data/scheduler/releaseRule";
loadEnvConfig(process.cwd());
const db = new PrismaClient();
async function main() {
  // Reuse the FRED source provisioned by P0; never create a parallel provider.
  if (!await db.dataSource.findUnique({ where: { id: "fred" } })) throw new Error("先执行 data:seed-p0");
  for (const r of US_MONEY_CREDIT_SERIES) {
    const existing = await db.instrument.findUnique({ where: { code: r.code } });
    const old = existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? existing.metadata as Record<string, unknown> : {};
    const metadata = { ...old, countryCode: "US", countryNameZh: "美国", catalogKey: `fred:${r.fredId}`,
      catalogCategory: r.category, displayName: r.name, unit: r.unit, freqLabel: r.freqLabel,
      source: `Fed H.${r.releaseId === 21 ? "6" : "8"}/FRED`, sourceTag: "us-money-credit",
      sourceUrl: `https://fred.stlouisfed.org/series/${r.fredId}`, seasonalAdjustment: r.sa,
      observationStartDate: r.start, definitionNote: moneyCreditNotes(r.fredId),
      sourceUpdateNote: r.releaseId === 21 ? "H.6月报；FRED发布日历release 21" : "H.8每周发布；24小时探测并回读修订窗口",
      fetchAcquisition: { status: "known", method: "api", verifiedAt: "2026-11-17", note: "香港FRED API核实序列、单位、频率与release" } };
    const fields = { name: r.name, kind: "MACRO_SERIES" as const, fredSeriesId: r.fredId, freqLabel: r.freqLabel, unit: r.unit, metadata };
    const inst = await db.instrument.upsert({ where: { code: r.code }, create: { code: r.code, ...fields }, update: fields });
    const rule = moneyCreditRule(r);
    await db.dataSubscription.upsert({ where: { instrumentId: inst.id },
      create: { instrumentId: inst.id, sourceId: "fred", sourceSeriesKey: r.fredId, fetchMethod: "API", granularity: r.granularity, enabled: true, priority: 8, releaseRule: rule, nextRunAt: computeNextRunAt(rule, new Date()) },
      // Preserve successful fetch state and the current schedule on idempotent reseeds.
      update: { sourceId: "fred", sourceSeriesKey: r.fredId, fetchMethod: "API", granularity: r.granularity, enabled: true, releaseRule: rule } });
    console.log(`[us-money-credit] ${r.fredId} ${r.category} / ${r.group}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());

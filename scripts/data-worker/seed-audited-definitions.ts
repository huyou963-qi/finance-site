import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { AUDITED_DEFINITIONS, auditedDefinitionMetadata } from "../../src/lib/data/scheduler/auditedDefinitions";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  for (const definition of AUDITED_DEFINITIONS) {
    const old = await prisma.instrument.findUnique({ where: { code: definition.code }, select: { id: true, metadata: true, externalRefs: true } });
    if (!old) continue; // Never resurrect retired or deliberately removed series.
    if (definition.code === "sched_fred_UMCSENT") {
      await prisma.statisticalAgency.upsert({ where: { id: "us-umich" }, create: {
        id: "us-umich", countryCode: "US", nameZh: "密歇根大学消费者调查", nameEn: "University of Michigan Surveys of Consumers", websiteUrl: "https://www.sca.isr.umich.edu/" }, update: {} });
      await prisma.dataSource.upsert({ where: { id: "umich-official-csv" }, create: {
        id: "umich-official-csv", agencyId: "us-umich", name: "Michigan official CSV (owner-authorized)", adapterKind: "BULK_FILE", baseUrl: "https://www.sca.isr.umich.edu/files/tbcics.csv" }, update: {} });
      await prisma.dataSubscription.updateMany({ where: { instrumentId: old.id }, data: {
        sourceId: "umich-official-csv", revisionLookback: 24,
        releaseRule: { type: "probe_interval", intervalHours: 1 } } });
    }
    await prisma.instrument.update({ where: { id: old.id }, data: {
      name: definition.name, shortName: definition.name, unit: definition.unit, freqLabel: definition.freqLabel,
      ...(definition.code === "sched_fred_UMCSENT" ? { externalRefs: {
        ...(old.externalRefs && typeof old.externalRefs === "object" && !Array.isArray(old.externalRefs) ? old.externalRefs : {}),
        sourceId: "umich-official-csv", agencyId: "us-umich",
      } } : {}),
      metadata: { ...auditedDefinitionMetadata(old.metadata, definition),
        ...(definition.code === "sched_fred_UMCSENT" ? {
          scrape: { provider: "umich_official_csv" },
          fetchAcquisition: { status: "known", method: "official_public_csv", officialUrl: "https://www.sca.isr.umich.edu/files/tbcics.csv" },
          sourceUpdateNote: "官方初值/终值，纽约时间10:00发布；每小时检查CSV，保留版本。所有者确认已获授权。",
        } : {}) },
    } });
    if (["sched_fred_GS2", "sched_fred_GS10"].includes(definition.code)) {
      // Monthly H.15 market averages are not auction results. Probe the exact
      // FRED series, never use the Treasury auction calendar as its release.
      const sub = await prisma.dataSubscription.findUnique({ where: { instrumentId: old.id } });
      if (sub && !sub.releasePackageId) {
        const rule = sub.releaseRule as { type?: string; intervalHours?: number };
        const correctedRule = rule.type === "probe_interval" && rule.intervalHours === 24;
        const bounded = new Date(Date.now() + 24 * 3600000);
        const next = !correctedRule && sub.nextRunAt && sub.nextRunAt > bounded ? bounded : sub.nextRunAt;
        await prisma.dataSubscription.update({ where: { id: sub.id },
          data: { releaseRule: { type: "probe_interval", intervalHours: 24 }, nextRunAt: next } });
        if (String(next) !== String(sub.nextRunAt)) await prisma.scheduleAuditEvent.create({ data: {
          subscriptionId: sub.id, previousNextRunAt: sub.nextRunAt, nextRunAt: next,
          source: "authorized_subscription_repair", reason: "monthly_h15_yield_is_not_note_auction",
        } });
      }
    }
    if (["sched_fred_FGEXPND", "sched_fred_FGRECPT"].includes(definition.code)) {
      await prisma.dataSubscription.updateMany({ where: { instrumentId: old.id }, data: { granularity: "QUARTERLY" } });
      await prisma.dataSubscription.updateMany({ where: { instrumentId: old.id, releasePackageId: null },
        data: { releaseRule: { type: "probe_interval", intervalHours: 24 } } });
    }
  }
  console.log("[audited-definitions] legacy labels/units/frequency corrected; observation values and schedules preserved");
}
main().catch(() => { console.error("[audited-definitions] failed; credentials withheld"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

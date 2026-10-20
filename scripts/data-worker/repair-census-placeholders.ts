/** Explicit audited maintenance, never part of deploy or worker. Prints backup
 * rows to stdout in dry-run; save locally before --apply=<sha256>. No HK file. */
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { US_TRADE_COUNTRY_END_PERIODS } from "../../src/lib/data/scheduler/usTradeDetail/client";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const through = process.argv.find(arg => arg.startsWith("--published-through="))?.split("=")[1];
  if (!through || !/^20\d\d-(0[1-9]|1[0-2])-01$/.test(through)) throw new Error("Require independently confirmed --published-through=YYYY-MM-01");
  const limit = new Date(through);
  const nsaThrough = process.argv.find(arg => arg.startsWith("--nsa-file-through="))?.split("=")[1] ?? through;
  if (!/^20\d\d-(0[1-9]|1[0-2])-01$/.test(nsaThrough) || new Date(nsaThrough) > limit) throw new Error("Invalid independently confirmed NSA file boundary");
  const now = new Date();
  if (limit >= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))) throw new Error("Publication boundary must precede this month");
  const subs = await prisma.dataSubscription.findMany({ where: { sourceId: "us-census-trade-detail" },
    include: { instrument: { select: { id: true, code: true } } } });
  const candidates = [];
  for (const sub of subs) {
    if (!/^census_us_trade_(?:exports|imports)_country_(?:nsa_)?\d{4}$/.test(sub.instrument.code)) continue;
    const ended = sub.instrument.code.includes("_country_nsa_") ? US_TRADE_COUNTRY_END_PERIODS[sub.instrument.code.slice(-4)] : undefined;
    const cutoff = ended ? new Date(ended) : sub.instrument.code.includes("_country_nsa_") ? new Date(nsaThrough) : limit;
    const rows = await prisma.macroObservation.findMany({ where: { instrumentId: sub.instrumentId, obsDate: { gt: cutoff } }, orderBy: { obsDate: "asc" } });
    if (rows.some(row => row.value !== 0)) throw new Error(`Nonzero beyond audited boundary: ${sub.instrument.code}; stop for review`);
    if (rows.length || ended) candidates.push({ code: sub.instrument.code, subscriptionId: sub.id,
      instrumentId: sub.instrumentId, cutoff, ended: Boolean(ended), previousEnabled: sub.enabled, rows });
  }
  candidates.sort((a, b) => a.code.localeCompare(b.code));
  const digest = createHash("sha256").update(JSON.stringify({ through, nsaThrough, candidates })).digest("hex");
  const apply = process.argv.find(arg => arg.startsWith("--apply="))?.split("=")[1];
  if (!apply) { console.log(JSON.stringify({ dryRun: true, through, nsaThrough, digest, candidates })); return; }
  if (apply !== digest) throw new Error("Backup digest differs from current exact targets; save a fresh local dry-run first");
  let removed = 0;
  await prisma.$transaction(async tx => {
    for (const item of candidates) {
      const result = await tx.macroObservation.deleteMany({ where: { id: { in: item.rows.map(row => row.id) }, value: 0 } });
      if (result.count !== item.rows.length) throw new Error("Concurrent observation change; rollback");
      removed += result.count;
      const latest = await tx.macroObservation.findFirst({ where: { instrumentId: item.instrumentId }, orderBy: { obsDate: "desc" } });
      await tx.dataSubscription.update({ where: { id: item.subscriptionId }, data: {
        lastObsDate: latest?.obsDate ?? null, ...(item.ended ? { enabled: false } : {}),
      } });
      await tx.scheduleAuditEvent.create({ data: { subscriptionId: item.subscriptionId,
        source: "authorized_subscription_repair", reason: "census_remove_unpublished_zero_placeholders",
        metadata: { digest, through, nsaThrough, cutoff: item.cutoff.toISOString(), removed: result.count,
          priorEnabled: item.previousEnabled, ended: item.ended, localBackupRequired: true,
          evidenceUrl: item.ended ? `https://www.census.gov/foreign-trade/balance/c${item.code.slice(-4)}.html` : "https://www.census.gov/foreign-trade/current/" } } });
    }
  }, { timeout: 120000 });
  console.log(JSON.stringify({ applied: true, digest, instruments: candidates.length, removed, retainedVintageLedger: true }));
}
main().catch(error => { console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, "[DB]")); process.exitCode = 1; }).finally(() => prisma.$disconnect());

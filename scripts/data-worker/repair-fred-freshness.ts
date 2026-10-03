/** Bounded repair of FRED series proven behind by audit-freshness --live-fred.
 * Defaults to dry-run. Uses the normal subscription writer and preserves package schedules.
 * npm run data:repair-fred-freshness -- --report=.data/audits/macro-latest.json --apply
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
import type { FreshnessFinding } from "../../src/lib/data/scheduler/freshnessAudit";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const args = process.argv.slice(2);
const reportPath = args.find((arg) => arg.startsWith("--report="))?.slice(9);
const apply = args.includes("--apply");
const onlyCode = args.find((arg) => arg.startsWith("--code="))?.slice(7);
const limit = Math.min(100, Math.max(1, Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) ?? "50")));

async function main() {
  if (!reportPath) throw new Error("必须传 --report=<audit-freshness --live-fred 生成的 JSON>");
  const report = JSON.parse(await fs.readFile(reportPath, "utf8")) as {
    checkedAt: string; liveFred: boolean; findings: FreshnessFinding[];
  };
  if (!report.liveFred) throw new Error("报告未执行 FRED 源端核对，拒绝补抓");
  const checkedAt = new Date(report.checkedAt);
  if (Number.isNaN(checkedAt.getTime()) || Date.now() - checkedAt.getTime() > 24 * 3_600_000) {
    throw new Error("审计报告超过 24 小时；先重新核对源端");
  }
  const cutoff = new Date(checkedAt.getTime() - 366 * 86_400_000);
  const candidates = new Map<string, FreshnessFinding>();
  for (const finding of report.findings) {
    if (finding.sourceId !== "fred" || !["source_ahead", "source_value_differs"].includes(finding.code)) continue;
    if (onlyCode && finding.instrumentCode !== onlyCode) continue;
    if (finding.code === "source_ahead") {
      const sourceDate = /FRED 最新 (\d{4}-\d{2}-\d{2})/.exec(finding.detail)?.[1];
      if (!sourceDate || new Date(`${sourceDate}T00:00:00Z`) < cutoff) continue;
    }
    candidates.set(finding.instrumentCode, finding);
  }
  console.log(`[repair-fred-freshness] candidates=${candidates.size} limit=${limit} apply=${apply}`);
  let success = 0;
  let failed = 0;
  for (const [code, finding] of [...candidates].slice(0, limit)) {
    const sub = await prisma.dataSubscription.findFirst({
      where: { instrument: { code }, enabled: true, sourceId: "fred" },
      include: {
        source: true,
        instrument: { select: { id: true, code: true, name: true, metadata: true } },
        releasePackage: { select: { id: true, labelZh: true, releaseTemplate: true, scheduleState: true, nextRunAt: true } },
      },
    });
    if (!sub) { console.log(`  skip ${code}: 订阅不可用`); continue; }
    if (finding.code === "source_value_differs" && sub.lastObsDate && sub.lastObsDate < cutoff) {
      console.log(`  skip ${code}: 仅有旧历史修订，需专项核对`);
      continue;
    }
    if (!apply) { console.log(`  would repair ${code}: ${finding.detail}`); continue; }
    const result = await runDataSubscription(prisma, sub, { force: true, preserveNextRunAt: true });
    console.log(`  ${code}: ${result.status} +${result.rowsUpserted}${result.error ? ` ${result.error}` : ""}`);
    if (result.status === "failed") failed++;
    else success++;
  }
  console.log(`[repair-fred-freshness] success=${success} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

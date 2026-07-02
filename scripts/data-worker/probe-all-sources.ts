/**
 * 逐条探测宏观序列的数据获取方式，结果写入 metadata.fetchAcquisition
 *
 * npm run data:probe-sources
 * npm run data:probe-sources -- --scope=imported
 * npm run data:probe-sources -- --scope=overview
 * npm run data:probe-sources -- --scope=all
 * npm run data:probe-sources -- --prefix=usov_ --skip-known
 * npm run data:probe-sources -- --dry-run --limit=20
 * npm run data:probe-sources -- --resume-from=chov_c050 --report=.data/probe-report.jsonl
 * npm run data:probe-sources -- --fred-sleep-ms=800
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { runProbeBatch } from "../../src/lib/data/scheduler/probeRunner";
import { loadInstrumentsForProbe } from "../../src/lib/data/scheduler/sourceProbe";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let scope: "imported" | "all" | "overview" = "imported";
  let dryRun = false;
  let limit = 0;
  let prefix = "";
  let skipKnown = false;
  let resumeFrom = "";
  let reportPath = "";
  let fredSleepMs = 600;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--skip-known" || a === "--only-pending") skipKnown = true;
    else if (a.startsWith("--scope=")) {
      const v = a.slice("--scope=".length);
      if (v === "all" || v === "imported" || v === "overview") scope = v;
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a.startsWith("--prefix=")) {
      prefix = a.slice("--prefix=".length).trim();
    } else if (a.startsWith("--resume-from=")) {
      resumeFrom = a.slice("--resume-from=".length).trim();
    } else if (a.startsWith("--report=")) {
      reportPath = a.slice("--report=".length).trim();
    } else if (a.startsWith("--fred-sleep-ms=")) {
      fredSleepMs = Math.max(
        550,
        parseInt(a.slice("--fred-sleep-ms=".length), 10) || 600,
      );
    }
  }
  return { scope, dryRun, limit, prefix, skipKnown, resumeFrom, reportPath, fredSleepMs };
}

async function loadOverviewScope() {
  return loadInstrumentsForProbe(prisma, "imported").then((rows) =>
    rows.filter(
      (r) =>
        r.code.startsWith("jpov_") ||
        r.code.startsWith("chov_") ||
        r.code.startsWith("usov_") ||
        r.code.startsWith("debtcap_") ||
        r.code.startsWith("sched_fred_"),
    ),
  );
}

async function main() {
  const {
    scope,
    dryRun,
    limit,
    prefix,
    skipKnown,
    resumeFrom,
    reportPath,
    fredSleepMs,
  } = parseArgs();
  const fredKey = process.env.FRED_API_KEY?.trim();

  let instruments =
    scope === "overview"
      ? await loadOverviewScope()
      : await loadInstrumentsForProbe(prisma, scope === "all" ? "all" : "imported");

  if (prefix) {
    instruments = instruments.filter((i) => i.code.startsWith(prefix));
  }
  if (limit > 0) instruments = instruments.slice(0, limit);

  console.log(
    `[data:probe-sources] scope=${scope} count=${instruments.length} dryRun=${dryRun} skipKnown=${skipKnown} fredSleepMs=${fredSleepMs}`,
  );
  if (resumeFrom) console.log(`[data:probe-sources] resume-from=${resumeFrom}`);
  if (reportPath) console.log(`[data:probe-sources] report=${reportPath}`);
  if (!fredKey) {
    console.warn("[warn] 未配置 FRED_API_KEY，美国/FRED 探测将跳过");
  }

  const result = await runProbeBatch(prisma, instruments, {
    fredApiKey: fredKey,
    fredSleepMs,
    dryRun,
    skipKnown,
    resumeFrom,
    reportPath: reportPath || undefined,
    onLine: (line) => console.log(line),
  });

  console.log(
    `[done] known=${result.known} pending=${result.pending} skipped=${result.skipped} processed=${result.total}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

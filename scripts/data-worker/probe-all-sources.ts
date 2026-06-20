/**
 * 逐条探测宏观序列的数据获取方式，结果写入 metadata.fetchAcquisition
 *
 * npm run data:probe-sources
 * npm run data:probe-sources -- --scope=imported
 * npm run data:probe-sources -- --scope=overview   # 仅 overview + debtcap + sched_fred
 * npm run data:probe-sources -- --dry-run
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import {
  loadInstrumentsForProbe,
  probeInstrumentAcquisition,
  saveProbeResult,
} from "../../src/lib/data/scheduler/sourceProbe";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let scope: "imported" | "all" | "overview" = "imported";
  let dryRun = false;
  let limit = 0;
  let prefix = "";
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--scope=")) {
      const v = a.slice("--scope=".length);
      if (v === "all" || v === "imported" || v === "overview") scope = v;
    } else if (a.startsWith("--limit=")) {
      limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    } else if (a.startsWith("--prefix=")) {
      prefix = a.slice("--prefix=".length).trim();
    }
  }
  return { scope, dryRun, limit, prefix };
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
  const { scope, dryRun, limit, prefix } = parseArgs();
  const fredKey = process.env.FRED_API_KEY?.trim();

  let instruments =
    scope === "overview"
      ? await loadOverviewScope()
      : await loadInstrumentsForProbe(prisma, scope === "all" ? "all" : "imported");

  if (limit > 0) instruments = instruments.slice(0, limit);
  if (prefix) {
    instruments = instruments.filter((i) => i.code.startsWith(prefix));
  }

  console.log(
    `[data:probe-sources] scope=${scope} count=${instruments.length} dryRun=${dryRun}`,
  );
  if (!fredKey) {
    console.warn("[warn] 未配置 FRED_API_KEY，美国/FRED 探测将跳过");
  }

  let known = 0;
  let pending = 0;

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i]!;
    const outcome = await probeInstrumentAcquisition(inst, {
      fredApiKey: fredKey,
      sleepMs:
        inst.code.startsWith("usov_") ||
        inst.code.startsWith("sched_fred_") ||
        Boolean(inst.fredSeriesId)
          ? 600
          : 0,
    });

    if (outcome.status === "known") known += 1;
    else pending += 1;

    const mark = outcome.status === "known" ? "OK" : "??";
    console.log(
      `[${mark}] ${inst.code} | ${outcome.methodLabel ?? outcome.method} | ${outcome.message ?? ""}`,
    );

    if (!dryRun) {
      await saveProbeResult(prisma, inst.id, inst.metadata, outcome);
    }
  }

  console.log(
    `[done] known=${known} pending=${pending} total=${instruments.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

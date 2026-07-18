/**
 * 从 mds.equity_security（有 GICS sector ≈ SP500 seed）展开
 * symbol × mode × year 队列格，写入 .data/market-event-ingest-queue.json。
 *
 * Usage:
 *   npm run events:ingest-gen-sp500
 *   npm run events:ingest-gen-sp500 -- --modes=rating,price-target --from-year=2016 --dry-run
 *   npm run events:ingest-gen-sp500 -- --limit=50
 */
import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/prisma";
import { GICS_SECTOR_CODES } from "../src/lib/data/eventTaxonomy";
import type { GicsSector } from "../src/lib/equity/gicsCatalog";
import {
  DEFAULT_WINDOW_FROM,
  defaultOutputFile,
  loadQueue,
  RECENT_YEAR_FROM,
  saveQueue,
  sectorWaveRank,
  upsertTasks,
  yearPriorityOffset,
  yearSlices,
  type IngestQueueTask,
} from "../src/lib/data/eventIngestQueue";

loadEnvConfig(process.cwd());

const MEGA_CAPS = new Set([
  "AAPL",
  "MSFT",
  "GOOGL",
  "GOOG",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
  "BRK.B",
  "BRK-B",
  "JPM",
  "V",
  "MA",
  "UNH",
  "XOM",
  "JNJ",
]);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function gicsCodeForSectorName(name: string | null): string | undefined {
  if (!name) return undefined;
  if (name in GICS_SECTOR_CODES) {
    return GICS_SECTOR_CODES[name as GicsSector];
  }
  if (name.startsWith("Communication")) {
    return GICS_SECTOR_CODES["Communication Services"];
  }
  return undefined;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const windowFrom = argValue("--window-from") ?? DEFAULT_WINDOW_FROM;
  const windowTo =
    argValue("--window-to") ?? new Date().toISOString().slice(0, 10);
  const fromYear = Number(argValue("--from-year") ?? windowFrom.slice(0, 4));
  const toYear = Number(argValue("--to-year") ?? windowTo.slice(0, 4));
  const modes = (argValue("--modes") ?? "rating,price-target,ops-news")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const includeSpeech = hasFlag("--include-speech") || modes.includes("speech");
  const limit = argValue("--limit") ? Number(argValue("--limit")) : undefined;

  const rows = await prisma.equitySecurity.findMany({
    where: {
      gicsSector: { not: null },
      NOT: { gicsSector: "" },
    },
    select: {
      symbol: true,
      gicsSector: true,
      gicsIndustryCode: true,
      marketCap: true,
    },
    orderBy: [{ marketCap: "desc" }, { symbol: "asc" }],
  });

  const slices = yearSlices(windowFrom, windowTo).filter(
    (s) => s.year >= fromYear && s.year <= toYear,
  );

  const now = new Date().toISOString();
  const tasks: IngestQueueTask[] = [];
  let symbolsUsed = 0;

  for (const row of rows) {
    if (limit != null && symbolsUsed >= limit) break;
    symbolsUsed++;
    const symbol = row.symbol.toUpperCase();
    const sector = row.gicsSector ?? "";
    const wave = sectorWaveRank(sector);
    const industryCode =
      row.gicsIndustryCode?.replace(/\D/g, "").slice(0, 2) ||
      gicsCodeForSectorName(sector);

    const modeList = [...modes];
    if (includeSpeech && MEGA_CAPS.has(symbol) && !modeList.includes("speech")) {
      modeList.push("speech");
    }

    for (const mode of modeList) {
      if (mode === "speech" && !MEGA_CAPS.has(symbol)) continue;
      for (const s of slices) {
        const yOff = yearPriorityOffset(s.year, RECENT_YEAR_FROM);
        const modeOff =
          mode === "rating" ? 0 : mode === "price-target" ? 1 : mode === "ops-news" ? 2 : 3;
        const yearTie = (2100 - s.year) * 0.001;
        const task: IngestQueueTask = {
          id: `${symbol}-${mode}-${s.year}`,
          mode,
          priority: 50 + yOff + wave + modeOff * 0.1 + yearTie,
          status: "pending",
          year: s.year,
          gicsSector: sector,
          query: {
            from: s.from,
            to: s.to,
            symbol,
            assets: [symbol],
            industries: industryCode ? [industryCode] : undefined,
            tags: sector ? [sector] : undefined,
            country: "US",
          },
          notes: `P2 SP500 ${symbol} ${mode} ${s.year} [${sector}]`,
          createdAt: now,
        };
        task.outputFile = defaultOutputFile(task);
        tasks.push(task);
      }
    }
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          sp500Count: rows.length,
          symbolsUsed,
          modes,
          yearSlices: slices.length,
          wouldAdd: tasks.length,
          sample: tasks.slice(0, 5).map((t) => t.id),
        },
        null,
        2,
      ),
    );
    return;
  }

  const queue = loadQueue();
  queue.windowFrom = windowFrom;
  queue.windowTo = windowTo;
  const refreshPending = hasFlag("--refresh-pending");
  const { added, skippedExisting, refreshed } = upsertTasks(queue, tasks, {
    refreshPending,
  });
  saveQueue(queue);

  console.log(
    JSON.stringify(
      {
        sp500Count: rows.length,
        symbolsUsed,
        modes,
        yearSlices: slices.length,
        generated: tasks.length,
        added,
        skippedExisting,
        refreshed,
        totalInQueue: queue.tasks.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

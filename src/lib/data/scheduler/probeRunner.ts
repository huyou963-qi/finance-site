import type { PrismaClient } from "@prisma/client";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readFetchAcquisition } from "./fetchAcquisition";
import { getFredRateLimiter } from "./fredRateLimiter";
import {
  type InstrumentProbeInput,
  probeInstrumentAcquisition,
  saveProbeResult,
  type ProbeOutcome,
} from "./sourceProbe";

export type RunProbeBatchOptions = {
  fredApiKey?: string;
  /** FRED 请求最小间隔（毫秒），默认 600 */
  fredSleepMs?: number;
  dryRun?: boolean;
  skipKnown?: boolean;
  resumeFrom?: string;
  reportPath?: string;
  onLine?: (line: string) => void;
};

export type ProbeBatchResult = {
  known: number;
  pending: number;
  skipped: number;
  total: number;
};

function isKnownAcquisition(metadata: unknown): boolean {
  return readFetchAcquisition(metadata)?.status === "known";
}

function appendReport(
  reportPath: string,
  inst: InstrumentProbeInput,
  outcome: ProbeOutcome,
  index: number,
): void {
  mkdirSync(dirname(reportPath), { recursive: true });
  const row = {
    index,
    code: inst.code,
    status: outcome.status,
    method: outcome.method ?? null,
    methodLabel: outcome.methodLabel ?? null,
    message: outcome.message ?? outcome.error ?? null,
    probedAt: outcome.probedAt,
  };
  appendFileSync(reportPath, `${JSON.stringify(row)}\n`, "utf8");
}

export async function runProbeBatch(
  prisma: PrismaClient,
  instruments: InstrumentProbeInput[],
  options: RunProbeBatchOptions,
): Promise<ProbeBatchResult> {
  const fredSleepMs = options.fredSleepMs ?? 600;
  const limiter = getFredRateLimiter(fredSleepMs);
  const resumeFrom = options.resumeFrom?.trim() ?? "";
  let skipped = 0;
  let known = 0;
  let pending = 0;
  let processed = 0;

  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i]!;
    if (resumeFrom && inst.code < resumeFrom) {
      skipped += 1;
      continue;
    }
    if (options.skipKnown && isKnownAcquisition(inst.metadata)) {
      skipped += 1;
      continue;
    }

    const outcome = await probeInstrumentAcquisition(inst, {
      fredApiKey: options.fredApiKey,
      fredRateLimiter: limiter,
    });

    processed += 1;
    if (outcome.status === "known") known += 1;
    else pending += 1;

    const mark = outcome.status === "known" ? "OK" : "??";
    const line = `[${mark}] ${inst.code} | ${outcome.methodLabel ?? outcome.method ?? "—"} | ${outcome.message ?? outcome.error ?? ""}`;
    options.onLine?.(line);

    if (options.reportPath) {
      appendReport(options.reportPath, inst, outcome, i);
    }

    if (!options.dryRun) {
      await saveProbeResult(prisma, inst.id, inst.metadata, outcome);
    }
  }

  return { known, pending, skipped, total: processed };
}

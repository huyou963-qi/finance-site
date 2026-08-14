/** 阶段 E HTTP 契约与缓存验收；要求目标服务已启动。 */

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function request(path: string): Promise<{
  status: number;
  ms: number;
  bytes: number;
  cacheControl: string | null;
  body: unknown;
}> {
  const baseUrl = (arg("base-url") ?? "http://localhost:3000").replace(/\/$/, "");
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { headers: { Accept: "application/json" } });
  const text = await response.text();
  return {
    status: response.status,
    ms: performance.now() - started,
    bytes: Buffer.byteLength(text),
    cacheControl: response.headers.get("cache-control"),
    body: text ? JSON.parse(text) : null,
  };
}

async function main() {
  const path = "/api/equity/sector-history/stages/svb-btfp-ai/transmission?mode=asOf&aggregation=capWeighted&sector=information-technology";
  const first = await request(path);
  const second = await request(path);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.ok(first.bytes < 150 * 1024, "有效响应超过 150KB");
  assert.match(first.cacheControl ?? "", /max-age=60/);
  const payload = first.body as { definitionsVersion?: string; sectors?: unknown[] };
  assert.equal(payload.definitionsVersion, "2026-08-13.d3");
  assert.equal(payload.sectors?.length, 11);

  const invalidMode = await request(
    "/api/equity/sector-history/stages/svb-btfp-ai/transmission?mode=future",
  );
  assert.equal(invalidMode.status, 400);
  assert.equal((invalidMode.body as { code?: string }).code, "INVALID_MODE");

  const invalidAggregation = await request(
    "/api/equity/sector-history/stages/svb-btfp-ai/transmission?aggregation=weightedAverage",
  );
  assert.equal(invalidAggregation.status, 400);
  assert.equal((invalidAggregation.body as { code?: string }).code, "INVALID_AGGREGATION");

  const invalidSector = await request(
    "/api/equity/sector-history/stages/svb-btfp-ai/transmission?sector=not-a-sector",
  );
  assert.equal(invalidSector.status, 400);
  assert.equal((invalidSector.body as { code?: string }).code, "INVALID_SECTOR");

  const missingStage = await request(
    "/api/equity/sector-history/stages/not-a-stage/transmission",
  );
  assert.equal(missingStage.status, 404);
  assert.equal((missingStage.body as { code?: string }).code, "STAGE_NOT_FOUND");

  console.log(JSON.stringify({
    status: "passed",
    valid: {
      firstMs: Number(first.ms.toFixed(1)),
      secondMs: Number(second.ms.toFixed(1)),
      kb: Number((first.bytes / 1024).toFixed(1)),
      cacheControl: first.cacheControl,
    },
    errors: {
      invalidMode: invalidMode.status,
      invalidAggregation: invalidAggregation.status,
      invalidSector: invalidSector.status,
      missingStage: missingStage.status,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

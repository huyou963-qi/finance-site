import assert from "node:assert/strict";

const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
const url = `${baseUrl}/api/equity/regime-forward-study`;

async function timedRequest() {
  const started = performance.now();
  const response = await fetch(url);
  const text = await response.text();
  return {
    response,
    text,
    elapsedMs: performance.now() - started,
  };
}

async function main() {
  const first = await timedRequest();
  const second = await timedRequest();
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  const payload = JSON.parse(second.text) as {
    methodology?: { evidenceGrade?: string };
    selectedByHorizon?: unknown[];
    models?: unknown[];
    current?: { horizons?: unknown[] } | null;
    overallVerdict?: { verdict?: string };
  };
  assert.equal(payload.methodology?.evidenceGrade, "C");
  assert.equal(payload.selectedByHorizon?.length, 3);
  assert.equal(payload.models?.length, 4);
  assert.equal(payload.current?.horizons?.length, 3);
  assert.ok(["supported", "weak", "unsupported", "insufficient"].includes(payload.overallVerdict?.verdict ?? ""));
  assert.match(second.response.headers.get("cache-control") ?? "", /max-age=300/);
  assert.ok(Buffer.byteLength(second.text, "utf8") < 250 * 1024);
  assert.ok(second.elapsedMs < 500, `warm HTTP ${second.elapsedMs.toFixed(1)}ms exceeds 500ms`);
  console.log(JSON.stringify({
    status: "passed",
    firstMs: Number(first.elapsedMs.toFixed(1)),
    secondMs: Number(second.elapsedMs.toFixed(1)),
    kb: Number((Buffer.byteLength(second.text, "utf8") / 1024).toFixed(1)),
    cacheControl: second.response.headers.get("cache-control"),
    verdict: payload.overallVerdict?.verdict,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

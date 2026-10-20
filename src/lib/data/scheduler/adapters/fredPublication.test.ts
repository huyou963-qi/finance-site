import assert from "node:assert/strict";
import test from "node:test";
import { fetchFredIncremental, parseFredLastUpdated } from "./fredAdapter";
import type { FredRateLimiter } from "../fredRateLimiter";
import { parseReleaseRule } from "../releaseRule";
import { parsePackageScheduleState } from "../releasePackageStore";

test("publication proofs survive member/package JSON parsing", () => {
  const sourceSync = { status: "current", verifiedAt: "2026-10-20T12:00:00Z",
    sourcePublishedAt: "2026-10-19T12:00:00Z",
    sourcePublications: [{ releaseId: 18, publishedAt: "2026-10-19T12:00:00Z" }] };
  const rule = parseReleaseRule({ type: "economic_calendar", sourceSync });
  assert.equal(rule.type, "economic_calendar");
  if (rule.type !== "economic_calendar") throw new Error("unexpected rule");
  assert.equal(rule.sourceSync?.sourcePublishedAt, sourceSync.sourcePublishedAt);
  assert.deepEqual(rule.sourceSync?.sourcePublications, sourceSync.sourcePublications);
  assert.deepEqual(parsePackageScheduleState({ sourceSync }).sourceSync, rule.sourceSync);
});

test("mixed release fetch resolves each series' own release before reading observations", async () => {
  const calls: string[] = [];
  const limiter = { fetch: async (url: string) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path.endsWith("observations")) return Response.json({ observations: [{ date: "2026-09-01", value: "1" }] });
    if (path.endsWith("release")) return Response.json({ releases: [{ id: 101 }] });
    return Response.json({ seriess: [{ id: "DFEDTARU", last_updated: "2026-10-15 09:02:03-05" }] });
  } } as FredRateLimiter;
  const result = await fetchFredIncremental("DFEDTARU", "test-key", "2026-05-01", limiter, true, true);
  assert.deepEqual(calls, ["/fred/series", "/fred/series/release", "/fred/series/observations"]);
  assert.deepEqual(result.sourcePublications, [{ releaseId: 101, publishedAt: "2026-10-15T14:02:03.000Z" }]);
});

test("FRED publication timestamps retain DST offsets and reject unknown formats", () => {
  assert.equal(parseFredLastUpdated("2026-10-15 09:02:03-05")?.toISOString(), "2026-10-15T14:02:03.000Z");
  assert.equal(parseFredLastUpdated("2026-11-13 09:02:03-06")?.toISOString(), "2026-11-13T15:02:03.000Z");
  assert.equal(parseFredLastUpdated("2026-10-20"), null);
});

test("metadata must precede observations; failed proof still permits saving observations", async () => {
  for (const metadataOk of [true, false]) {
    const calls: string[] = [];
    const limiter = { fetch: async (url: string) => {
      calls.push(new URL(url).pathname);
      return url.includes("/observations")
        ? Response.json({ observations: [{ date: "2026-09-01", value: "159.78" }] })
        : metadataOk ? Response.json({ seriess: [{ id: "PPIFIS", last_updated: "2026-10-15 09:02:03-05" }] })
          : new Response("unavailable", { status: 503 });
    } } as FredRateLimiter;
    const result = await fetchFredIncremental("PPIFIS", "test-key", "2026-05-01", limiter, true);
    assert.deepEqual(calls, ["/fred/series", "/fred/series/observations"]);
    assert.equal(result.points[0].value, 159.78);
    assert.equal(Boolean(result.sourcePublishedAt), metadataOk);
    if (!metadataOk) assert.ok(result.sourceMetadata?.publicationError);
  }
});

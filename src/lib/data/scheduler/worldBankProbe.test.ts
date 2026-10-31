import assert from "node:assert/strict";
import test from "node:test";
import { probeWorldBank } from "./sourceProbe";

test("WDI acquisition discovers historical-only series and chooses latest non-null year regardless of order", async () => {
  const original = globalThis.fetch;
  try {
    for (const reverse of [false, true]) {
      globalThis.fetch = async (url, init) => {
        const parsed = new URL(String(url));
        assert.match(parsed.pathname, /country\/EMU\/indicator/);
        assert.match(parsed.searchParams.get("date")!, /^1960:\d{4}$/);
        assert.equal(parsed.searchParams.get("per_page"), "100");
        assert.ok(init?.signal);
        const rows = [{date:"2025",value:null},{date:"2014",value:27.02},{date:"1992",value:0}];
        return new Response(JSON.stringify([{}, reverse ? rows.reverse() : rows]));
      };
      const result = await probeWorldBank("EA", "CM.MKT.LCAP.GD.ZS");
      assert.equal(result.status, "known");
      assert.equal(result.sampleObsDate, "2014-01-01");
      assert.equal(result.sampleValue, 27.02);
      assert.match(result.message!, /不代表近期仍发布/);
    }
  } finally { globalThis.fetch = original; }
});

test("all-null coverage stays pending while an actual zero remains available", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify([{}, [{date:"2025",value:null}]]));
    assert.equal((await probeWorldBank("ES", "FS.AST.DOMS.GD.ZS")).status, "pending");
    globalThis.fetch = async () => new Response(JSON.stringify([{}, [{date:"1992",value:0}]]));
    const result = await probeWorldBank("ES", "FS.AST.DOMS.GD.ZS");
    assert.equal(result.status, "known");
    assert.equal(result.sampleValue, 0);
  } finally { globalThis.fetch = original; }
});

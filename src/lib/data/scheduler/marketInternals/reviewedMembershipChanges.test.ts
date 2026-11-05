import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewedMembershipChanges } from "./reviewedMembershipChanges";
import { validateCorroboration } from "./membershipBaseline";
test("official event takes effect Nov4, not announcement or merger day; unknown mismatches stay blocked", () => {
  const baseline = [...Array.from({length: 500}, (_, i) => `X${i}`), "KVUE"];
  for (const day of ["2026-10-30", "2026-11-02", "2026-11-03"]) {
    const r = applyReviewedMembershipChanges(baseline, [], "2026-10-29", day);
    assert.ok(r.current.includes("KVUE")); assert.ok(!r.current.includes("OKTA")); assert.equal(r.changes.length, 0);
  }
  const r = applyReviewedMembershipChanges(baseline, [], "2026-10-29", "2026-11-04");
  assert.ok(r.current.includes("OKTA")); assert.ok(!r.current.includes("KVUE"));
  assert.equal(r.changes[0].date, "2026-11-04"); assert.match(r.sources[0], /press.spglobal.com/);
  assert.doesNotThrow(() => validateCorroboration(r.current, r.current, "2026-11-04", "2026-11-05"));
  assert.throws(() => validateCorroboration(r.current, [...r.current.slice(1), "UNKNOWN"], "2026-11-04", "2026-11-05"), /不一致/);
  assert.equal(applyReviewedMembershipChanges(r.current, r.changes, "2026-10-29", "2026-11-05").changes.length, 1);
  assert.throws(() => applyReviewedMembershipChanges(["OTHER"], [], "2026-10-29", "2026-11-04"), /禁止猜测/);
  assert.throws(() => applyReviewedMembershipChanges(baseline, [{...r.changes[0], addedTicker:"OTHER"}], "2026-10-29", "2026-11-04"), /冲突/);
});

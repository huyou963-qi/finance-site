import { test } from "node:test";
import assert from "node:assert/strict";
import { SEC_PREDECESSORS, mergeSecPredecessorFacts } from "./secPredecessors";

test("法定前身有界合并：限定CIK与生效日前，当前集团重述优先且保留来源", () => {
  const point = { start: "2020-01-01", end: "2020-03-31", val: 100, form: "10-Q", filed: "2020-05-01", accn: "old-source" };
  const shape = (cik: number, points: typeof point[]) => ({ cik, facts: { "us-gaap": { Revenues: { units: { USD: points } } } } });
  const current = shape(2012383, [{ ...point, val: 120, filed: "2024-11-01", accn: "new-restatement" }]);
  const old = shape(1364742, [
    { ...point, start: "2019-01-01", end: "2019-03-31" },
    { ...point, val: 999, filed: "2026-01-01" },
    { ...point, start: "2024-10-01", end: "2024-12-31", val: 777 },
  ]);
  const result = mergeSecPredecessorFacts(current, old) as typeof current;
  assert.deepEqual(result.facts["us-gaap"].Revenues.units.USD.map(p => [p.end, p.val, p.accn]), [
    ["2019-03-31", 100, "old-source"], ["2020-03-31", 120, "new-restatement"],
  ]);
  assert.equal(mergeSecPredecessorFacts(current, shape(123, [point])), current);
  const unrelated = shape(999, []);
  assert.equal(mergeSecPredecessorFacts(unrelated, old), unrelated);
  assert.equal(old.facts["us-gaap"].Revenues.units.USD.length, 3);
});

test("注册表每个继任者最多两名前身，全部附官方申报且不拼入Inphi/GIP等收购对象", () => {
  const counts = new Map<number, number>();
  for (const rule of SEC_PREDECESSORS) {
    counts.set(rule.current, (counts.get(rule.current) ?? 0) + 1);
    assert.match(rule.before, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(rule.source, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//);
    assert.notEqual(rule.current, rule.predecessor);
  }
  assert.ok([...counts.values()].every(n => n <= 2));
  assert.deepEqual(SEC_PREDECESSORS.filter(r => r.current === 1835632).map(r => r.predecessor), [1058057]);
});

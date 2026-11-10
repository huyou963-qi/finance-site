import assert from "node:assert/strict";
import { test } from "node:test";
import { SourceAdapterKind } from "@prisma/client";
import { inspectFreshnessRow, type FreshnessAuditRow } from "./freshnessAudit";

const now = new Date("2026-10-03T06:00:00Z");
const base: FreshnessAuditRow = {
  instrumentCode: "sched_fred_PAYEMS", metadata: { fetchAcquisition: { status: "known" } },
  sourceId: "fred", packageId: "us.bls.employment_situation",
  adapterKind: SourceAdapterKind.FRED_API, sourceSeriesKey: "PAYEMS", enabled: true,
  granularity: "MONTHLY", nextRunAt: new Date("2026-11-06T13:33:00Z"),
  lastSuccessAt: new Date("2026-10-02T12:50:00Z"),
  subscribedLastObsDate: new Date("2026-08-01"), actualLastObsDate: new Date("2026-08-01"),
  actualLastValue: 159075, lastError: null, lastFetchStatus: "SKIPPED",
  lastFetchAt: new Date("2026-10-02T12:50:00Z"),
};

test("enabled subscription lacking fetchAcquisition is critical even when nextRun is future", () => {
  const findings = inspectFreshnessRow({ ...base, instrumentCode: "sched_fred_ADPMNUSNERSA", metadata: {} }, now);
  assert.ok(findings.some((f) => f.code === "unschedulable" && f.severity === "critical"));
});

test("actual observations distinguish importer data from an empty series", () => {
  const findings = inspectFreshnessRow({ ...base, subscribedLastObsDate: null }, now);
  assert.ok(findings.some((f) => f.code === "bookkeeping_drift"));
  assert.ok(!findings.some((f) => f.code === "no_observations"));
});

test("empty series and stale failed subscription are reported separately", () => {
  const findings = inspectFreshnessRow({
    ...base, actualLastObsDate: null, actualLastValue: null,
    nextRunAt: new Date("2026-10-01T00:00:00Z"), lastError: "HTTP 404",
  }, now);
  assert.deepEqual(
    new Set(findings.map((f) => f.code)),
    new Set(["no_observations", "fetch_error", "overdue"]),
  );
});

test("archives require explicit lifecycle, disabled subscription and stored history", () => {
  const archived = {...base, sourceId:"mof-budget-accounts", enabled:false,
    metadata:{historicalOnly:true,archiveAfterBootstrap:true},lastError:"old failure",lastFetchStatus:"FAILED"};
  assert.deepEqual(inspectFreshnessRow(archived,now),[]);
  assert.ok(inspectFreshnessRow({...archived,actualLastObsDate:null},now).some(f=>f.code==="no_observations"));
  assert.ok(inspectFreshnessRow({...archived,metadata:{}},now).some(f=>f.code==="disabled"));
});

test("projections are checked against their actual fact store, not exempted unconditionally", () => {
  const projection = {...base,instrumentCode:"quant_regime_growth_z",sourceId:null,enabled:null,
    metadata:{projectionOnly:true,sourceTag:"quant-macro-regime-projection"},actualLastObsDate:null};
  assert.ok(inspectFreshnessRow(projection,now).some(f=>f.code==="no_observations"));
  assert.deepEqual(inspectFreshnessRow({...projection,projectionLastObsDate:new Date("2026-09-01")},now),[]);
  assert.ok(inspectFreshnessRow({...projection,projectionLastObsDate:new Date("2020-01-01")},now).some(f=>f.code==="overdue"));
});

test("a source-pending member is a warning inside its grace window and critical after it", () => {
  const lastError = "[source_pending until=2026-10-05] 国家统计局 PPI：已发布 2026-09，但 x 未列入月报且国家数据尚未补齐";
  const pending = { ...base, lastError, lastFetchStatus: "FAILED" };
  const inside = inspectFreshnessRow(pending, now);
  assert.ok(inside.some((f) => f.code === "source_pending" && f.severity === "warning"));
  assert.ok(!inside.some((f) => f.code === "fetch_error"));
  const after = inspectFreshnessRow(pending, new Date("2026-10-06T00:00:00Z"));
  assert.ok(after.some((f) => f.code === "source_pending" && f.severity === "critical"));
});

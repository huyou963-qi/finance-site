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

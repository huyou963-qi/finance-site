import assert from "node:assert/strict";
import test from "node:test";
import { parseNbsPmiHistoryResponse } from "./historyClient";

test("parses UUID history response and sorts periods", () => {
  const mapping = new Map([["uuid-1", "series-1"]]);
  const result = parseNbsPmiHistoryResponse(
    {
      data: [
        { code: "202602MM", values: [{ _id: "uuid-1", value: "50.2" }] },
        { code: "202601MM", values: [{ _id: "uuid-1", value: "49.8" }] },
      ],
    },
    mapping,
  );
  assert.deepEqual(
    result.get("series-1")?.map((point) => [
      point.obsDate.toISOString().slice(0, 10),
      point.value,
    ]),
    [
      ["2026-01-01", 49.8],
      ["2026-02-01", 50.2],
    ],
  );
});

test("rejects missing indicators instead of silently writing partial history", () => {
  assert.throws(
    () =>
      parseNbsPmiHistoryResponse(
        { data: [{ code: "202601MM", values: [] }] },
        new Map([["uuid-1", "series-1"]]),
      ),
    /返回 0 个历史点/,
  );
});

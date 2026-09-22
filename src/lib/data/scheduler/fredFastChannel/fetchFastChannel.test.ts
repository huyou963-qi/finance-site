import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { FRED_FAST_CHANNELS, fredFastChannelFor } from "./catalog";
import { clearFredFastChannelCache, extendWithFastChannel, parseDatedCsvColumn } from "./fetchFastChannel";

const PAR_CSV = `Date,"1 Mo","2 Yr","10 Yr"
09/21/2026,3.96,4.76,4.96
09/18/2026,3.97,4.76,5.01
09/17/2026,3.98,4.70,4.94
`;
const VIX_CSV = `DATE,OPEN,HIGH,LOW,CLOSE
09/18/2026,15.070000,15.630000,14.800000,14.810000
09/21/2026,14.960000,15.130000,14.600000,14.870000
`;

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  clearFredFastChannelCache();
});

function mockFetch(body: string | Error) {
  globalThis.fetch = (async () => {
    if (body instanceof Error) throw body;
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

test("parseDatedCsvColumn：带引号表头、MM/DD/YYYY、CBOE 六位小数取两位", () => {
  assert.deepEqual([...parseDatedCsvColumn(PAR_CSV, "Date", "10 Yr")], [
    ["2026-09-21", 4.96],
    ["2026-09-18", 5.01],
    ["2026-09-17", 4.94],
  ]);
  assert.equal(parseDatedCsvColumn(VIX_CSV, "DATE", "CLOSE").get("2026-09-21"), 14.87);
  assert.throws(() => parseDatedCsvColumn(PAR_CSV, "Date", "7 Yr"), /缺列/);
});

test("extendWithFastChannel：只追加 FRED 最新日期之后的观测，FRED 已有日期不动", async () => {
  mockFetch(PAR_CSV);
  const fred = {
    points: [
      { obsDate: d("2026-09-17"), value: 4.94 },
      { obsDate: d("2026-09-18"), value: 5.01 },
    ],
    sourceLatestObsDate: d("2026-09-18"),
    skippedInvalid: 0,
  };
  const out = await extendWithFastChannel("DGS10", fredFastChannelFor("DGS10")!, fred, "2026-06-01");
  assert.deepEqual(
    out.points.map((p) => [p.obsDate.toISOString().slice(0, 10), p.value]),
    [
      ["2026-09-17", 4.94],
      ["2026-09-18", 5.01],
      ["2026-09-21", 4.96],
    ],
  );
  assert.equal(out.sourceLatestObsDate?.toISOString().slice(0, 10), "2026-09-21");
});

test("extendWithFastChannel：官方渠道失败时原样返回 FRED 结果", async () => {
  mockFetch(new Error("network down"));
  const fred = { points: [{ obsDate: d("2026-09-18"), value: 14.81 }], sourceLatestObsDate: d("2026-09-18"), skippedInvalid: 0 };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const out = await extendWithFastChannel("VIXCLS", fredFastChannelFor("VIXCLS")!, fred, "2026-06-01");
    assert.equal(out, fred);
  } finally {
    console.warn = warn;
  }
});

test("映射只登记 H.15 名义/实际收益率与 CBOE 波动率", () => {
  for (const id of Object.keys(FRED_FAST_CHANNELS)) {
    assert.match(id, /^(DGS\d+(MO)?|DFII\d+|VIXCLS|VXVCLS)$/);
  }
  assert.equal(fredFastChannelFor("BAMLH0A0HYM2"), null);
  assert.equal(fredFastChannelFor("dgs10")?.kind, "treasury");
});

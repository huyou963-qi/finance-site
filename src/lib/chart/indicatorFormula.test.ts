import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { compileIndicatorFormula, evaluateIndicatorFormula } from "./indicatorFormula";
import { FORMULA_PRESETS, evaluateOnCandles, formulaOutputData, formulaVolumes } from "./formulaIndicators";
import { colorsForKlineMode } from "./klineColorScheme";

function compile(source: string) {
  const result = compileIndicatorFormula(source);
  assert.ok(result.ok, JSON.stringify(result));
  return result.program;
}

function values(source: string, close: number[], name = "OUT") {
  return [...evaluateIndicatorFormula(compile(source), { CLOSE: close }, close.length).get(name)!];
}

test("named constants, comments, intermediate variables and styled multi-output formulas", () => {
  const program = compile("{ weekly test }\nn:=2; base:=MA(C,n); // first output\nout:100*(C/base-1),HIST,#2563EB; zero:0;");
  assert.deepEqual(program.outputs, [
    { name: "OUT", plot: "histogram", color: "#2563EB" },
    { name: "ZERO", plot: "line" },
  ]);
  const result = evaluateIndicatorFormula(program, { CLOSE: [1, 3, 5, 7] }, 4);
  const out = result.get("OUT")!;
  assert.ok(Number.isNaN(out[0]));
  assert.deepEqual([...out.slice(1)].map(value => Math.round(value * 100) / 100), [50, 25, 16.67]);
  assert.deepEqual([...result.get("ZERO")!], [0, 0, 0, 0]);
});

test("missing values and division by zero leave gaps, with explicit fallback through NZ", () => {
  assert.deepEqual(values("OUT:C/REF(C,1);", [0, 3, 6]), [NaN, NaN, 2]);
  assert.deepEqual(values("OUT:NZ(C/REF(C,1),0);", [0, 3, 6]), [0, 0, 2]);
  assert.deepEqual(values("OUT:MA(C,2);", [1, 3, NaN, 2, 4]), [NaN, 2, NaN, NaN, 3]);
  assert.deepEqual(values("OUT:RMA(C,2);", [1, 3, 4, NaN, 2, 6, 8]), [NaN, 2, 3, NaN, NaN, 4, 6]);
});

test("rolling highs/lows, boolean precedence, crosses and cumulative sums", () => {
  const close = [1, 3, 5, 2, 0, 4, 7];
  assert.deepEqual(values("OUT:HHV(C,3);", close), [NaN, NaN, 5, 5, 5, 4, 7]);
  assert.deepEqual(values("OUT:LLV(C,2);", close), [NaN, 1, 3, 2, 0, 0, 4]);
  assert.deepEqual(values("OUT:CROSS(C,2);", close), [NaN, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual(values("OUT:COUNT(C>2 AND C<6 OR C=7,2);", close), [NaN, 1, 2, 1, 0, 1, 2]);
  assert.deepEqual(values("OUT:SUM(C,0);", close), [1, 4, 9, 11, 11, 15, 22]);
});

test("rejects unknown symbols, forward references, out-of-range periods and executable syntax", () => {
  const cases = [
    ["X:=MA(C,2);\nOUT:FOO(X);", "unknown", 2, 5],
    ["OUT:REF(C,-1);", "period", 1, 5],
    ["OUT:EMA(C,C);", "period", 1, 5],
    ["OUT:EMA(C,501);", "period", 1, 5],
    ["OUT:MA(C);", "arguments", 1, 5],
    ["OUT:CLOSE;\nOUT:HIGH;", "duplicate", 2, 1],
    ["OUT:CLOSE,COLORXYZ;", "style", 1, 11],
    ["OUT:globalThis.alert(1);", "unknown", 1, 5],
    ["OUT:LATER; LATER:=C;", "unknown", 1, 5],
    ["TEMP:=1;", "output", 1, 9],
  ] as const;
  for (const [source, code, line, column] of cases) {
    const result = compileIndicatorFormula(source);
    assert.ok(!result.ok, source);
    assert.deepEqual([result.error.code, result.error.line, result.error.column], [code, line, column], source);
  }
});

const candles: CandlestickData[] = Array.from({ length: 50 }, (_, i) => ({
  time: (1700000000 + i * 86400) as UTCTimestamp,
  open: i + 10,
  high: i + 11,
  low: i + 8,
  close: i + 10,
}));
const volumes = candles.map((_, i) => i + 100);

test("all shipped presets produce finite values on representative candles", () => {
  for (const preset of FORMULA_PRESETS) {
    const outputs = evaluateOnCandles(compile(preset.source), candles, volumes);
    for (const [name, series] of outputs) assert.ok(Number.isFinite(series.at(-1)), `${preset.name} / ${name}`);
  }
  const preset = (id: string) => evaluateOnCandles(
    compile(FORMULA_PRESETS.find(p => p.id === `formula:${id}`)!.source), candles, volumes,
  );
  assert.equal(preset("atr").get("ATR")![13], 3);
  assert.equal(preset("adx").get("ADX")![27], 100);
  assert.equal(preset("donchian").get("TOP")![19], 30);
  assert.equal(preset("obv").get("OBV")![2], 203);
  assert.equal(preset("rvol").get("RVOL")![20], 120 / 109.5);
});

test("volume formulas never receive synthesized volume and whitespace stays aligned", () => {
  const program = compile("OUT:VOL,HIST; LAG:REF(C,1);");
  assert.equal(formulaVolumes({ candles, volumes, volumeAvailable: false }), undefined);
  assert.equal(formulaVolumes({ candles, volumes: [1] }), undefined);
  assert.equal(formulaVolumes({ candles, volumes }), volumes);
  const [volume, lag] = formulaOutputData(program, candles, undefined, colorsForKlineMode("red-up"));
  assert.ok(volume!.every(point => !("value" in point)));
  assert.deepEqual(lag!.slice(0, 2), [{ time: candles[0]!.time }, { time: candles[1]!.time, value: 10 }]);
});

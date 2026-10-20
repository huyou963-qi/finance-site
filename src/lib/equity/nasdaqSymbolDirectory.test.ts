import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNasdaqSymbolDirectory } from "./nasdaqSymbolDirectory";

test("Nasdaq directory includes ETFs and excludes test issues and timestamp footer", () => {
  const rows = parseNasdaqSymbolDirectory([
    "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
    "SOXX|iShares Semiconductor ETF|G|N|N|40|Y|N",
    "AAPL|Apple Inc.|Q|N|N|100|N|N",
    "TEST|Test issue|Q|Y|N|100|N|N",
    "File Creation Time: 1015202607:00|||||||",
  ].join("\r\n"));
  assert.deepEqual(rows.map(row => [row.symbol, row.type, row.exchange]), [["SOXX", "ETF", "Nasdaq"], ["AAPL", undefined, "Nasdaq"]]);
});

test("other exchanges include ETFs and supported class shares but do not guess preferred codes", () => {
  const rows = parseNasdaqSymbolDirectory([
    "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
    "SMH|VanEck Semiconductor ETF|P|SMH|Y|100|N|SMH",
    "BRK.B|Berkshire Hathaway Class B|N|BRK.B|N|100|N|BRK.B",
    "ABC$A|Preferred issue|N|ABCpA|N|100|N|ABC-A",
  ].join("\n"));
  assert.deepEqual(rows.map(row => [row.symbol, row.type, row.exchange]), [["SMH", "ETF", "NYSE Arca"], ["BRK-B", undefined, "NYSE"]]);
  assert.throws(() => parseNasdaqSymbolDirectory("<html>upstream error</html>"), /格式异常/);
});

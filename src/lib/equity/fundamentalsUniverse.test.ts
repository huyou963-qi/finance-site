import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { isActiveUsGaapFiler, isCommonEquityName, latestPublicFloat, rankUniverse } from "./fundamentalsUniverse";
import { openSecBulkArchive } from "./secBulkArchive";

const floatPoint = (val: number, end: string, filed: string, form = "10-K") => ({ val, end, filed, form });

test("public float: latest 10-K value filed within 18 months, never a 10-Q, a future filing or a zero", () => {
  const facts = { facts: { dei: { EntityPublicFloat: { units: { USD: [
    floatPoint(100, "2024-06-30", "2025-02-14"), floatPoint(150, "2025-06-30", "2026-02-13"),
    floatPoint(999, "2026-06-30", "2026-08-01", "10-Q"), floatPoint(500, "2026-06-30", "2027-02-01"), floatPoint(0, "2026-06-30", "2026-03-01"),
  ] } } } } };
  assert.deepEqual(latestPublicFloat(facts, "2026-11-09"), { float: { value: 150, measuredAt: "2025-06-30", filed: "2026-02-13" }, rejected: 0 });
  assert.equal(latestPublicFloat(facts, "2028-01-01").float!.value, 500);
  // 18 个月内没有 10-K（公司停止申报或刚上市）：无数据，不进名单
  assert.equal(latestPublicFloat(facts, "2029-12-01").float, null);
  assert.equal(latestPublicFloat({}, "2026-11-09").float, null);
});

test("active filer needs a recent us-gaap 10-Q/10-K fact; IFRS filers and stale filers are out", () => {
  const recent = { facts: { "us-gaap": { Assets: { units: { USD: [{ val: 1, end: "2026-06-30", filed: "2026-08-01", form: "10-Q" }] } } } } };
  assert.equal(isActiveUsGaapFiler(recent, "2026-11-09"), true);
  assert.equal(isActiveUsGaapFiler(recent, "2028-01-01"), false);
  assert.equal(isActiveUsGaapFiler({ facts: { "ifrs-full": {} } }, "2026-11-09"), false);
});

test("ranking keeps the largest public floats, ties broken by CIK", () => {
  const c = (cik: string, publicFloat: number) => ({ cik, symbols: [cik], name: cik, publicFloat, measuredAt: "", filed: "" });
  const { selected, cutoff } = rankUniverse([c("3", 10), c("1", 30), c("2", 10), c("4", 5)], 3);
  assert.deepEqual(selected.map(s => s.cik), ["1", "2", "3"]);
  assert.equal(cutoff, 10);
});

test("archive reader decompresses one company at a time from a real zip", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sec-bulk-"));
  try {
    const path = join(dir, "companyfacts.zip");
    const apple = { cik: 320193, entityName: "Apple Inc.", facts: { dei: {} } };
    writeFileSync(path, zipSync({
      "CIK0000320193.json": strToU8(JSON.stringify(apple)),
      "CIK0000000001.json": [strToU8("{\"cik\":1}"), { level: 0 }],
      "readme.txt": strToU8("not a company"),
    }));
    const archive = await openSecBulkArchive(path);
    try {
      assert.deepEqual(archive.ciks().sort(), ["0000000001", "0000320193"]);
      assert.equal(archive.has("320193"), true);
      assert.deepEqual(await archive.read("320193"), apple);
      assert.deepEqual(await archive.read("1"), { cik: 1 });
      await assert.rejects(archive.read("42"), /没有 CIK0000000042/);
    } finally {
      await archive.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scale errors in public float are corrected on the latest 10-K, falling back to an older value only if no scale fits", () => {
  const facts = { facts: {
    dei: { EntityPublicFloat: { units: { USD: [floatPoint(4.4e9, "2024-06-30", "2025-06-02"), floatPoint(4.429e15, "2025-06-30", "2026-02-13")] } } },
    "us-gaap": { Assets: { units: { USD: [{ val: 3.6e9, end: "2025-12-31", filed: "2026-02-13", form: "10-K" }] } } },
  } };
  assert.deepEqual(latestPublicFloat(facts, "2026-11-09"), { float: { value: 4.429e9, measuredAt: "2025-06-30", filed: "2026-02-13", corrected: 1e6 }, rejected: 1 });
  // 任何量级都不合理（比总资产大得离谱又不是 1,000 的整数倍错位）：退回上一份可信的 10-K
  const noScale = { facts: { ...facts.facts, dei: { EntityPublicFloat: { units: { USD: [floatPoint(4.4e9, "2024-06-30", "2025-06-02"), floatPoint(9e18, "2025-06-30", "2026-02-13")] } } } } };
  assert.deepEqual(latestPublicFloat(noScale, "2026-11-09"), { float: { value: 4.4e9, measuredAt: "2024-06-30", filed: "2025-06-02" }, rejected: 1 });
  // 只有错位的值：按 1,000 / 1,000,000 纠正量级（Cabot 实际约 44 亿，申报 4.429e15）
  const onlyBad = { facts: { ...facts.facts, dei: { EntityPublicFloat: { units: { USD: [floatPoint(4.429e15, "2025-06-30", "2026-02-13")] } } } } };
  assert.deepEqual(latestPublicFloat(onlyBad, "2026-11-09"), { float: { value: 4.429e9, measuredAt: "2025-06-30", filed: "2026-02-13", corrected: 1e6 }, rejected: 1 });
  // 银行资产大、×1,000 错位逃过资产检验：再看权益（Trustmark 申报 9.62e11，权益约 20 亿）
  const bank = { facts: { dei: { EntityPublicFloat: { units: { USD: [floatPoint(9.62e11, "2025-06-30", "2026-02-13")] } } },
    "us-gaap": { Assets: { units: { USD: [{ val: 1.85e10, end: "2025-12-31", filed: "2026-02-13", form: "10-K" }] } },
      StockholdersEquity: { units: { USD: [{ val: 2.0e9, end: "2025-12-31", filed: "2026-02-13", form: "10-K" }] } } } } };
  assert.deepEqual(latestPublicFloat(bank, "2026-11-09").float, { value: 9.62e8, measuredAt: "2025-06-30", filed: "2026-02-13", corrected: 1e3 });
  // 真实的高估值公司（流通市值约为总资产 30 倍，如 NVIDIA）不被误杀
  const nvda = { facts: { dei: { EntityPublicFloat: { units: { USD: [floatPoint(4.2e12, "2025-07-27", "2026-02-25")] } } },
    "us-gaap": { Assets: { units: { USD: [{ val: 1.4e11, end: "2026-01-25", filed: "2026-02-25", form: "10-K" }] } },
      StockholdersEquity: { units: { USD: [{ val: 1.0e11, end: "2026-01-25", filed: "2026-02-25", form: "10-K" }] } } } } };
  assert.equal(latestPublicFloat(nvda, "2026-11-09").float!.value, 4.2e12);
});

test("only common equity names are kept", () => {
  for (const name of ["Apple Inc. - Common Stock", "Alphabet Inc. - Class A Common Stock", "Equity Residential Common Shares of Beneficial Interest",
    "Enterprise Products Partners L.P. Common Units", "Bright Horizons Family Solutions Inc. Common Stock", "Accenture plc Class A Ordinary Shares",
    "Alphabet Inc. - Class C Capital Stock", "Zillow Group, Inc. - Class C Capital Stock"]) {
    assert.equal(isCommonEquityName(name), true, name);
  }
  for (const name of ["CleanSpark, Inc. - Warrant", "Novanta Inc. - Units", "Acme Acquisition Corp - Units, each consisting of one share of Class A Common Stock and one Right",
    "T-Mobile US, Inc. 5.500% Senior Notes due 2070", "AT&T Inc. Depositary Shares", "XYZ Corp - Rights", "Pacific Fund Shares"]) {
    assert.equal(isCommonEquityName(name), false, name);
  }
});

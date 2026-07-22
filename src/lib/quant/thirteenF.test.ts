import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseSecDate,
  scaleValueToUsd,
  splitTsv,
  headerIndex,
  parseInfoTableRow,
  isValidCusip,
} from "./thirteenF";
import {
  normalizeIssuerName,
  nameMatchScore,
  resolveSymbolCusip,
  type IssuerCandidate,
} from "./cusipBridge";

describe("parseSecDate", () => {
  it("SEC 日期 → ISO", () => {
    assert.equal(parseSecDate("31-JAN-2025"), "2025-01-31");
    assert.equal(parseSecDate("01-DEC-2024"), "2024-12-01");
    assert.equal(parseSecDate("9-SEP-2013"), "2013-09-09");
  });
  it("非法输入 → null", () => {
    assert.equal(parseSecDate(""), null);
    assert.equal(parseSecDate("2025-01-31"), null);
    assert.equal(parseSecDate("31-XXX-2025"), null);
  });
});

describe("scaleValueToUsd（2023-01-03 单位切换）", () => {
  it("2023-01-03 前报千元 → ×1000", () => {
    assert.equal(scaleValueToUsd(500, "2022-11-14"), 500_000);
    assert.equal(scaleValueToUsd(500, "2023-01-02"), 500_000);
  });
  it("2023-01-03 起报元 → 原值", () => {
    assert.equal(scaleValueToUsd(613102, "2023-01-03"), 613102);
    assert.equal(scaleValueToUsd(613102, "2025-01-31"), 613102);
  });
});

describe("parseInfoTableRow", () => {
  const header =
    "ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tFIGI\tVALUE\tSSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL\tINVESTMENTDISCRETION\tOTHERMANAGER\tVOTING_AUTH_SOLE\tVOTING_AUTH_SHARED\tVOTING_AUTH_NONE";
  const idx = headerIndex(header);

  it("普通股 SH 行正常解析", () => {
    const row = parseInfoTableRow(
      splitTsv("acc1\t1\t3M CO\tCOM\t88579Y101\t\t613102\t4073\tSH\t\tSOLE\t0\t0\t0\t4073"),
      idx,
    );
    assert.ok(row);
    assert.equal(row!.cusip, "88579Y101");
    assert.equal(row!.shares, 4073);
    assert.equal(row!.value, 613102);
  });
  it("期权行（PUTCALL 非空）→ null", () => {
    const row = parseInfoTableRow(
      splitTsv("acc1\t2\tAPPLE INC\tCOM\t037833100\t\t1000\t10\tSH\tPut\tSOLE\t0\t0\t0\t10"),
      idx,
    );
    assert.equal(row, null);
  });
  it("PRN（债券本金）行 → null", () => {
    const row = parseInfoTableRow(
      splitTsv("acc1\t3\tSOME BOND\tNOTE\t123456789\t\t1000\t1000\tPRN\t\tSOLE\t0\t0\t0\t0"),
      idx,
    );
    assert.equal(row, null);
  });
});

describe("isValidCusip", () => {
  it("真实 CUSIP 校验通过", () => {
    assert.equal(isValidCusip("037833100"), true); // AAPL
    assert.equal(isValidCusip("88579Y101"), true); // MMM
    assert.equal(isValidCusip("02079K305"), true); // GOOGL
  });
  it("篡改校验位 → false", () => {
    assert.equal(isValidCusip("037833101"), false);
    assert.equal(isValidCusip("short"), false);
  });
});

describe("normalizeIssuerName", () => {
  it("剔后缀 + 大小写/标点统一", () => {
    assert.equal(normalizeIssuerName("Apple Inc."), "APPLE");
    assert.equal(normalizeIssuerName("APPLE INC"), "APPLE");
    assert.equal(normalizeIssuerName("Procter & Gamble Co"), "PROCTER AND GAMBLE");
    assert.equal(normalizeIssuerName("PROCTER AND GAMBLE CO"), "PROCTER AND GAMBLE");
  });
  it("保留区分性 token（GROUP/HOLDINGS）", () => {
    assert.equal(normalizeIssuerName("Arch Capital Group"), "ARCH CAPITAL GROUP");
  });
});

describe("nameMatchScore", () => {
  it("归一后相等 → 1", () => {
    assert.equal(nameMatchScore("Apple Inc.", "APPLE INC"), 1);
  });
  it("缩写规范化后精确匹配（ABBOTT LABS ↔ ABBOTT LABORATORIES）", () => {
    // LABS→LABORATORIES 归一后完全相等
    assert.equal(nameMatchScore("Abbott Laboratories", "ABBOTT LABS"), 1);
  });
  it("13F 缩写 PWR/INTL 归一后命中", () => {
    assert.equal(nameMatchScore("American Electric Power", "AMERICAN ELECTRIC PWR"), 1);
    assert.ok(nameMatchScore("Expeditors International", "EXPEDITORS INTL WA") >= 0.6);
  });
  it("MICROSOFT vs MICRON 不假阳（公共前缀仅 5）", () => {
    assert.ok(nameMatchScore("Microsoft Corp", "Micron Technology") < 0.4);
  });
  it("去重音（Estée→ESTEE）", () => {
    assert.equal(nameMatchScore("Estée Lauder Companies", "ESTEE LAUDER COS INC"), 1);
  });
  it("词序颠倒仍命中（Lilly (Eli) ↔ ELI LILLY）", () => {
    assert.ok(nameMatchScore("Lilly (Eli)", "ELI LILLY & CO") >= 0.6);
  });
  it("花体撇号（O’Reilly）不破坏 token", () => {
    assert.ok(nameMatchScore("O’Reilly Automotive", "O REILLY AUTOMOTIVE INC") >= 0.6);
  });
  it("同前缀不同公司不假阳（American Express vs American Airlines）", () => {
    assert.ok(nameMatchScore("American Express", "AMERICAN AIRLINES GROUP INC") < 0.6);
  });
});

describe("resolveSymbolCusip", () => {
  const alphabet: IssuerCandidate[] = [
    { cusip: "02079K305", nameOfIssuer: "ALPHABET INC", titleOfClass: "CAP STK CL A", filerCount: 5337 },
    { cusip: "02079K107", nameOfIssuer: "ALPHABET INC", titleOfClass: "CAP STK CL C", filerCount: 4612 },
  ];
  it("class-hint 消歧 dual-class（GOOGL→CL A）", () => {
    const m = resolveSymbolCusip("GOOGL", "Alphabet Inc.", alphabet);
    assert.equal(m?.cusip, "02079K305");
    assert.equal(m?.method, "class-hint");
  });
  it("GOOG→CL C", () => {
    const m = resolveSymbolCusip("GOOG", "Alphabet Inc.", alphabet);
    assert.equal(m?.cusip, "02079K107");
  });
  it("无提示时取 filer 数最高候选", () => {
    const m = resolveSymbolCusip("XYZ", "Alphabet Inc.", alphabet);
    assert.equal(m?.cusip, "02079K305"); // filerCount 更高
  });
  it("低于阈值 → null（防误配）", () => {
    const m = resolveSymbolCusip(
      "ZZZZ", "Totally Unrelated Company",
      [{ cusip: "111111118", nameOfIssuer: "APPLE INC", titleOfClass: "COM", filerCount: 100 }],
    );
    assert.equal(m, null);
  });
  it("单候选精确匹配 method=exact", () => {
    const m = resolveSymbolCusip(
      "AAPL", "Apple Inc.",
      [{ cusip: "037833100", nameOfIssuer: "APPLE INC", titleOfClass: "COM", filerCount: 6486 }],
    );
    assert.equal(m?.cusip, "037833100");
    assert.equal(m?.method, "exact");
  });
});

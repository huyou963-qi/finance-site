import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseForm4Xml, parseOwnershipDate } from "./form4";

const SINGLE_TXN_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000320193</issuerCik>
    <issuerTradingSymbol>AAPL</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001214156</rptOwnerCik>
      <rptOwnerName>COOK TIMOTHY D</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>Chief Executive Officer</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-08-15</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>50000</value></transactionShares>
        <transactionPricePerShare><value>225.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>3200000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const MULTI_TXN_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000789019</issuerCik>
    <issuerTradingSymbol>MSFT</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001045810</rptOwnerCik>
      <rptOwnerName>NADELLA SATYA</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>CEO</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-06-01</value></transactionDate>
      <transactionCoding>
        <transactionCode>A</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>500000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2024-06-02</value></transactionDate>
      <transactionCoding>
        <transactionCode>F</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>300</value></transactionShares>
        <transactionPricePerShare><value>420.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>499700</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe("parseForm4Xml", () => {
  it("单笔交易：nonDerivativeTransaction 为对象而非数组也能解析", () => {
    const rows = parseForm4Xml(SINGLE_TXN_XML);
    assert.equal(rows.length, 1);
    const r = rows[0]!;
    assert.equal(r.issuerCik, "0000320193");
    assert.equal(r.issuerSymbol, "AAPL");
    assert.equal(r.filerCik, "0001214156");
    assert.equal(r.filerName, "COOK TIMOTHY D");
    assert.equal(r.isDirector, true);
    assert.equal(r.isOfficer, true);
    assert.equal(r.isTenPercentOwner, false);
    assert.equal(r.officerTitle, "Chief Executive Officer");
    assert.equal(r.transactionDate, "2024-08-15");
    assert.equal(r.transactionCode, "S");
    assert.equal(r.acquiredDisposedCode, "D");
    assert.equal(r.shares, 50000);
    assert.equal(r.pricePerShare, 225.5);
    assert.equal(r.sharesOwnedAfter, 3200000);
  });

  it("多笔交易：解出全部行，含无 pricePerShare 的授予交易", () => {
    const rows = parseForm4Xml(MULTI_TXN_XML);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.transactionCode, "A");
    assert.equal(rows[0]!.pricePerShare, null);
    assert.equal(rows[0]!.shares, 1000);
    assert.equal(rows[1]!.transactionCode, "F");
    assert.equal(rows[1]!.pricePerShare, 420);
    assert.equal(rows[1]!.shares, 300);
  });

  it("非法/空文档返回空数组", () => {
    assert.deepEqual(parseForm4Xml("<foo></foo>"), []);
    assert.deepEqual(parseForm4Xml(""), []);
  });
});

/** 高盛的申报代理输出带时区后缀的日期（真实案例 GS 0000769993-12-000461）。 */
const TZ_SUFFIX_DATE_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000886982</issuerCik>
    <issuerTradingSymbol>GS</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0001234567</rptOwnerCik>
      <rptOwnerName>DOE JANE</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2012-07-27-04:00</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>6000</value></transactionShares>
        <transactionPricePerShare><value>99.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>12000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe("带时区后缀的交易日期", () => {
  it("剥掉 XSD 时区后缀，保留纯日期", () => {
    const rows = parseForm4Xml(TZ_SUFFIX_DATE_XML);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].transactionDate, "2012-07-27");
  });
  it("畸形日期不被静默修正，仍原样传给下游拒收", () => {
    const rows = parseForm4Xml(TZ_SUFFIX_DATE_XML.replace("2012-07-27-04:00", "2012-13-99"));
    assert.equal(rows[0]?.transactionDate, "2012-13-99");
  });
});

/** 单笔卖出，footnotes 按顺序编号为 F1..Fn 并全部挂在交易行上。 */
function planFootnoteXml(footnotes: string[]): string {
  const refs = footnotes.map((_, i) => `<footnoteId id="F${i + 1}"/>`).join("");
  const notes = footnotes.map((text, i) => `<footnote id="F${i + 1}">${text}</footnote>`).join("");
  return `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>0001234567</issuerCik><issuerTradingSymbol>TEST</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0007654321</rptOwnerCik><rptOwnerName>DOE JOHN</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>CEO</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Class A Common Stock</value></securityTitle>
      <transactionDate><value>2026-04-01</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode>${refs}</transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>100.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts><sharesOwnedFollowingTransaction><value>50000</value></sharesOwnedFollowingTransaction></postTransactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes>${notes}</footnotes>
</ownershipDocument>`;
}

const adoptionDate = (...footnotes: string[]) => parseForm4Xml(planFootnoteXml(footnotes))[0]?.evidence.planAdoptionDate;

describe("10b5-1 计划采纳日", () => {
  it("CoreWeave 真实措辞：动词与日期之间夹 by the reporting person", () => {
    const rows = parseForm4Xml(planFootnoteXml([
      "The reported transaction represents a sale effected pursuant to a Rule 10b5-1 trading plan adopted by the reporting person on November 20, 2025.",
    ]));
    assert.equal(rows[0]?.evidence.plan, true);
    assert.equal(rows[0]?.evidence.planAdoptionDate, "2025-11-20");
  });

  it("修改视同重新采纳：取修改日（Rule 10b5-1(c)(1)(iv)；CRWV 10-K 亦按修改日登记）", () => {
    assert.equal(adoptionDate(
      "The reported transaction represents a sale effected pursuant to a Rule 10b5-1 trading plan adopted by the reporting person on June 3, 2025 and modified on November 20, 2025.",
    ), "2025-11-20");
  });

  for (const [label, footnote, expected] of [
    ["adopted on", "Sold pursuant to a Rule 10b5-1 trading plan adopted on May 1, 2024.", "2024-05-01"],
    ["entered into on + ISO", "Sold pursuant to a Rule 10b5-1 trading plan entered into on 2024-05-01.", "2024-05-01"],
    ["established 无 on", "Sold pursuant to a Rule 10b5-1 trading plan established March 1, 2024.", "2024-03-01"],
    ["dated + 月份缩写", "Sold under a Rule 10b5-1 trading plan dated Nov. 20, 2025.", "2025-11-20"],
    ["entered into by … on + 数字日期", "Sold pursuant to a Rule 10b5-1 trading plan entered into by the reporting person on 11/20/2025.", "2025-11-20"],
    ["gap 内含 Rule 10b5-1(c)", "Sold pursuant to a trading plan adopted in accordance with Rule 10b5-1(c) on Sept. 2, 2025.", "2025-09-02"],
    ["gap 内含缩写句点", "Sold pursuant to a Rule 10b5-1 trading plan adopted by Doe Family Trust, L.P. on November 20, 2025.", "2025-11-20"],
    ["日期在前", "On November 20, 2025, the reporting person adopted a Rule 10b5-1 trading plan. The sales reported were effected under that plan.", "2025-11-20"],
    ["adoption date 标签", "Sold pursuant to a Rule 10b5-1 trading plan (plan adoption date: May 23, 2025).", "2025-05-23"],
  ] as const) {
    it(`已知措辞：${label}`, () => assert.equal(adoptionDate(footnote), expected));
  }

  it("采纳日在另一条脚注，但该句仍指向 trading plan", () => {
    assert.equal(adoptionDate(
      "The sales reported were effected pursuant to a Rule 10b5-1 trading plan.",
      "The trading plan was adopted by the reporting person on May 23, 2025.",
    ), "2025-05-23");
  });

  it("反例：与计划无关的脚注里的日期不被捕获", () => {
    assert.equal(adoptionDate(
      "The sales reported were effected pursuant to a Rule 10b5-1 trading plan.",
      "Shares are held by the Doe Family Trust, which was established on January 5, 2015.",
    ), null);
  });

  it("反例：计划句无日期时不跨句捕获后一句的日期", () => {
    assert.equal(adoptionDate(
      "The sales were effected pursuant to a Rule 10b5-1 trading plan adopted by the reporting person. The price reported is a weighted average of sales on November 20, 2025.",
    ), null);
  });

  it("反例：采纳动词后先出现股数等数字时不跳到远处的截止日", () => {
    assert.equal(adoptionDate(
      "Sold pursuant to a Rule 10b5-1 trading plan adopted by the reporting person, which provides for the sale of up to 1,600,000 shares through November 20, 2026.",
    ), null);
  });

  it("反例：股权激励计划的采纳日不是 10b5-1 采纳日", () => {
    assert.equal(adoptionDate("Granted under the Company's 2025 Equity Incentive Plan, adopted on March 27, 2025."), null);
  });
});

describe("parseOwnershipDate", () => {
  for (const [raw, expected] of [
    ["November 20, 2025", "2025-11-20"],
    ["November 20 2025", "2025-11-20"],
    ["Nov. 20, 2025", "2025-11-20"],
    ["Sept. 2, 2025", "2025-09-02"],
    ["11/20/2025", "2025-11-20"],
    ["2025-11-20", "2025-11-20"],
    ["On May 1, 2024", "2024-05-01"],
    ["February 30, 2025", null],
    ["13/01/2025", null],
    ["Ma 1, 2025", null],
  ] as const) {
    it(`${raw} → ${expected}`, () => assert.equal(parseOwnershipDate(raw), expected));
  }
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseForm4Xml } from "./form4";

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

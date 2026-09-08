import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForeignIssuerFilingError, ingestOwnershipDocument } from "./ownershipSync";

/**
 * 持股超 10% 的机构要为被投公司提交 Form 4，这些申报同时索引在申报人自己的 CIK 下，
 * 按 CIK 拉取时必然连带取到。拒绝它们是对的，但必须与「解析失败」区分开——
 * 曾经混为一谈，导致 BAC/GS/BX 等 162 只股票的 coverage.complete 恒为 false，
 * 进而让 supplyRatio90/sellingAdv30 永久返回 null。
 */
const FOREIGN_ISSUER_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>0000074585</issuerCik>
    <issuerTradingSymbol>ONEIDA</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId>
      <rptOwnerCik>0000070858</rptOwnerCik>
      <rptOwnerName>BANK OF AMERICA CORP</rptOwnerName>
    </reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>0</isOfficer>
      <isTenPercentOwner>1</isTenPercentOwner>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2006-05-11</value></transactionDate>
      <transactionCoding>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>12.34</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>5000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

describe("ingestOwnershipDocument 的发行人归属判定", () => {
  it("发行人不是本公司时抛 ForeignIssuerFilingError，供调用方按跳过而非失败处理", async () => {
    // 以 BAC 自己的 CIK 去摄入一份发行人为 ONEIDA 的申报（真实案例 0000070858-06-000161）
    await assert.rejects(
      () =>
        ingestOwnershipDocument(
          {
            cik: "0000070858",
            symbol: "BAC",
            accession: "0000070858-06-000161",
            form: "4",
            filedAt: "2006-05-15",
            primaryDocument: null,
          },
          FOREIGN_ISSUER_XML,
        ),
      (e: unknown) => {
        assert.ok(
          e instanceof ForeignIssuerFilingError,
          `应为 ForeignIssuerFilingError，实际是 ${e instanceof Error ? e.name : typeof e}`,
        );
        return true;
      },
    );
  });
});

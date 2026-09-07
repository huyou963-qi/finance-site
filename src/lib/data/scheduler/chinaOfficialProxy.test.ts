import assert from "node:assert/strict";
import test from "node:test";
import { isChinaOfficialUrl } from "./chinaOfficialProxy";

test("只识别已登记的中国官方统计域名", () => {
  assert.equal(isChinaOfficialUrl("https://gks.mof.gov.cn/tongjishuju/"), true);
  assert.equal(isChinaOfficialUrl("https://data.stats.gov.cn/dg/website/"), true);
  assert.equal(isChinaOfficialUrl("https://www.stats.gov.cn/sj/"), true);
  assert.equal(isChinaOfficialUrl("https://www.pbc.gov.cn/diaochatongjisi/"), true);
  assert.equal(isChinaOfficialUrl("https://www.safe.gov.cn/safe/tjsj1/index.html"), true);
  assert.equal(isChinaOfficialUrl("https://www.nfra.gov.cn/cn/view/pages/tongjishuju/tongjishuju.html"), true);
  assert.equal(isChinaOfficialUrl("https://fred.stlouisfed.org/"), false);
});

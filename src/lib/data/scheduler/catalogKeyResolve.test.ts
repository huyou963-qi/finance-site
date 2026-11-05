import assert from "node:assert/strict";
import { test } from "node:test";
import {
  instrumentCodeForCatalogKey,
  parseSchedWbInstrumentCode,
} from "./catalogKeyResolve";

test("instrumentCodeForCatalogKey maps mds/fred/wb identities", () => {
  assert.equal(instrumentCodeForCatalogKey("mds:mof_cn_budget_national_social_revenue"), "mof_cn_budget_national_social_revenue");
  assert.equal(instrumentCodeForCatalogKey("fred:CPIAUCSL"), "sched_fred_CPIAUCSL");
  assert.equal(instrumentCodeForCatalogKey("fred:CPIAUCSL::yoy"), "sched_fred_CPIAUCSL");
  assert.equal(instrumentCodeForCatalogKey("wb:AU:SP.POP.GROW"), "sched_wb_AU_SP_POP_GROW");
  assert.equal(instrumentCodeForCatalogKey("wb:CA:FS.AST.DOMS.GD.ZS"), "sched_wb_CA_FS_AST_DOMS_GD_ZS");
  assert.equal(instrumentCodeForCatalogKey("unknown:x"), null);
});

test("parseSchedWbInstrumentCode prefers the longest matching WDI id", () => {
  const ids = ["FS.AST.DOMS.GD.ZS", "GC.DOD.TOTL.GD.ZS", "SP.POP.GROW"];
  assert.deepEqual(parseSchedWbInstrumentCode("sched_wb_AU_FS_AST_DOMS_GD_ZS", ids), {
    countryCode: "AU",
    indicatorId: "FS.AST.DOMS.GD.ZS",
  });
  assert.deepEqual(parseSchedWbInstrumentCode("sched_wb_BR_SP_POP_GROW", ids), {
    countryCode: "BR",
    indicatorId: "SP.POP.GROW",
  });
  assert.equal(parseSchedWbInstrumentCode("sched_fred_PAYEMS", ids), null);
});

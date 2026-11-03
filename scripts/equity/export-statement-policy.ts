import fs from "node:fs";
import { STATEMENT_CAPEX_ROLES, STATEMENT_EXTRA_CAPEX_TAGS } from "../../src/lib/equity/secStatementSupplement";
import { CASH_CAPEX_COMPONENTS } from "../../src/lib/equity/issuerCashCapex";
import { SEC_PREDECESSORS } from "../../src/lib/equity/secPredecessors";

const file = process.argv[2];
if (!file) throw Error("用法: tsx scripts/equity/export-statement-policy.ts <policy.json>");
fs.writeFileSync(file, JSON.stringify({ capex: STATEMENT_CAPEX_ROLES, extra: STATEMENT_EXTRA_CAPEX_TAGS, legacy: CASH_CAPEX_COMPONENTS, predecessors: SEC_PREDECESSORS }), { flag: "wx" });

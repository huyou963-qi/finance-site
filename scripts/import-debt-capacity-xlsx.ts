/**
 * @deprecated 请使用 npm run db:import-macro-xlsx -- --file=... --preset=debtcap
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_XLSX = "C:/Users/Administrator/Desktop/模板/国家偿债能力.xlsx";
const file = process.argv[2] ?? DEFAULT_XLSX;
const sheetArg = process.argv.find((a) => a.startsWith("--sheet="));

const args = [
  "tsx",
  path.join(__dirname, "import-macro-xlsx.ts"),
  `--file=${file}`,
  "--preset=debtcap",
];
if (sheetArg) args.push(sheetArg);

const r = spawnSync("npx", args, { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);

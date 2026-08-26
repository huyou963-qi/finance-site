/**
 * SEC EDGAR submissions 增量同步（8-K / 10-Q / 10-K）。
 * Usage:
 *   npm run equity:sync-sec -- --limit=50
 *   npm run equity:sync-sec -- --symbols=AAPL,TSLA --days=750
 */
import { prisma } from "../../src/lib/prisma";
import { syncSecFilings } from "../../src/lib/equity/secFilingSync";

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  const keyed = process.argv.find((value) => value.startsWith(`${name}=`));
  return keyed ? keyed.slice(name.length + 1) : undefined;
}

async function main() {
  const symbolsArg = argValue("--symbols");
  const result = await syncSecFilings({
    symbols: symbolsArg ? symbolsArg.split(",") : undefined,
    limit: symbolsArg ? undefined : Math.max(1, Number(argValue("--limit") ?? 50) || 50),
    lookbackDays: Math.max(30, Number(argValue("--days") ?? 400) || 400),
    delayMs: Math.max(120, Number(argValue("--delay-ms") ?? 250) || 250),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

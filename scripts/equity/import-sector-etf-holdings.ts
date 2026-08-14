import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/lib/prisma";
import {
  parseSsgaHoldingsWorkbook,
  replaceEtfHoldingSnapshot,
} from "../../src/lib/equity/sectorEtfHoldings";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  const file = arg("file");
  const etf = arg("etf")?.toUpperCase();
  const source = arg("source");
  if (!file || !etf || !source) {
    throw new Error("用法：npm run equity:import-sector-etf-holdings -- --file=<archived.xlsx> --etf=XLK --source=<source>");
  }
  const absolute = path.resolve(file);
  const snapshot = parseSsgaHoldingsWorkbook(fs.readFileSync(absolute), etf);
  const count = process.argv.includes("--dry-run")
    ? snapshot.rows.length
    : await replaceEtfHoldingSnapshot(snapshot, source, `file:${path.basename(absolute)}`);
  console.log(`${process.argv.includes("--dry-run") ? "验证" : "写入"} ${snapshot.etf} ${snapshot.asOfDate}: ${count} rows, weight=${(snapshot.totalWeight * 100).toFixed(3)}%`);
}

main().finally(() => prisma.$disconnect());

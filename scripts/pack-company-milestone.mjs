/**
 * Pack public/templates/company-milestone user-facing files into one zip.
 * Run after editing README / SKILL / schema / example:
 *   node scripts/pack-company-milestone.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "public", "templates", "company-milestone");
const zipName = "company-milestone-pack.zip";
const zipPath = path.join(dir, zipName);

const files = [
  "README.md",
  "SKILL.md",
  "ingest-output.schema.json",
  "example-TSLA.json",
];

for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) {
    console.error(`[pack-company-milestone] missing: ${p}`);
    process.exit(1);
  }
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const absFiles = files.map((f) => path.join(dir, f));

if (process.platform === "win32") {
  const ps = [
    `$ErrorActionPreference='Stop'`,
    `Compress-Archive -LiteralPath @(${absFiles.map((p) => `'${p.replace(/'/g, "''")}'`).join(",")}) -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal`,
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    stdio: "inherit",
  });
} else {
  execFileSync("zip", ["-j", "-q", zipPath, ...absFiles], { stdio: "inherit" });
}

const st = fs.statSync(zipPath);
console.log(`[pack-company-milestone] wrote ${zipPath} (${st.size} bytes)`);

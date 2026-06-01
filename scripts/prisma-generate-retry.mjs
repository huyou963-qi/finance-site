import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const clientDir = path.join(root, "node_modules", ".prisma", "client");
const schemaPath = path.join(root, "prisma", "schema.prisma");

function cleanupPrismaTmpFiles() {
  if (!fs.existsSync(clientDir)) return;
  for (const name of fs.readdirSync(clientDir)) {
    if (!name.includes(".tmp")) continue;
    try {
      fs.unlinkSync(path.join(clientDir, name));
    } catch {
      // another process may still hold the engine DLL
    }
  }
}

function clientIsUpToDate() {
  if (process.env.PRISMA_FORCE_GENERATE === "1") return false;
  const clientIndex = path.join(clientDir, "index.js");
  const engineWin = path.join(clientDir, "query_engine-windows.dll.node");
  const engineLinux = path.join(clientDir, "libquery_engine-debian-openssl-3.0.x.so.node");
  const hasEngine = fs.existsSync(engineWin) || fs.existsSync(engineLinux);
  if (!fs.existsSync(schemaPath) || !fs.existsSync(clientIndex) || !hasEngine) {
    return false;
  }
  const schemaMtime = fs.statSync(schemaPath).mtimeMs;
  const clientMtime = fs.statSync(clientIndex).mtimeMs;
  return clientMtime >= schemaMtime;
}

function sleep(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // sync wait between retries on Windows file locks
  }
}

function runGenerate() {
  const result = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  return result.status === 0;
}

cleanupPrismaTmpFiles();

if (clientIsUpToDate()) {
  console.log("[prisma] client is up to date — skip generate (set PRISMA_FORCE_GENERATE=1 to override)");
  process.exit(0);
}

const maxAttempts = 5;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  if (runGenerate()) {
    process.exit(0);
  }
  if (attempt === maxAttempts) {
    console.error("\n[prisma] generate failed: query_engine DLL is locked on Windows.");
    console.error("[prisma] Stop the running site first, then build again:");
    console.error("  1. Close terminals running `npm run dev` or `npm run start`");
    console.error("  2. Or run: taskkill /F /IM node.exe");
    console.error("  3. Then: npm run build\n");
    process.exit(1);
  }
  console.warn(`[prisma] generate retry ${attempt}/${maxAttempts - 1} in 2s...`);
  cleanupPrismaTmpFiles();
  sleep(2000);
}

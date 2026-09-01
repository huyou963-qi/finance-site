import { readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const scopeArg = process.argv.find((arg) => arg.startsWith("--scope="));
const scope = scopeArg?.slice("--scope=".length) || "all";

const rootsByScope = {
  unit: [resolve(root, "src")],
  architecture: [resolve(root, "tests", "architecture")],
  all: [resolve(root, "src"), resolve(root, "tests", "architecture")],
};

if (!(scope in rootsByScope)) {
  console.error(`[test] unknown scope: ${scope}`);
  process.exit(2);
}

function collectTests(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTests(path));
    else if (/\.(test|spec)\.(c|m)?(j|t)sx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = rootsByScope[scope]
  .filter((path) => statSync(path, { throwIfNoEntry: false })?.isDirectory())
  .flatMap(collectTests)
  .sort();

if (files.length === 0) {
  console.error(`[test] no tests found for scope: ${scope}`);
  process.exit(1);
}

console.log(`[test] ${scope}: running ${files.length} test files`);
for (const file of files) console.log(`  - ${relative(root, file).split(sep).join("/")}`);

const tsxCli = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(process.execPath, [
  tsxCli,
  "--test",
  "--test-reporter=spec",
  "--test-concurrency=4",
  ...files,
], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "test", TZ: "UTC" },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

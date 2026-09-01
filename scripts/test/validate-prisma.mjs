import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const prismaCli = resolve(root, "node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaCli, "validate"], {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/finance_site_test",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

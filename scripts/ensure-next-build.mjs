import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = ["BUILD_ID", "routes-manifest.json"].map((name) =>
  path.join(root, ".next", name),
);

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(
    "[start] 缺少生产构建产物，请先执行：npm run build\n" +
      `  缺失：${missing.map((f) => path.relative(root, f)).join(", ")}`,
  );
  process.exit(1);
}

/**
 * 打包 CI 构建产物，供阿里云服务器解压运行（不在服务器上 next build）。
 * 不含 .env.local；服务器上需已存在环境变量文件。
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const required = [
  ".next",
  "package.json",
  "package-lock.json",
  "prisma",
  "next.config.ts",
  "scripts/ensure-next-build.mjs",
  "scripts/prisma-generate-retry.mjs",
];

const optional = ["public"];

for (const p of required) {
  if (!fs.existsSync(p)) {
    console.error(`[deploy-pack] missing required: ${p}`);
    process.exit(1);
  }
}

const paths = [...required, ...optional.filter((p) => fs.existsSync(p))];

if (fs.existsSync("deploy.tar.gz")) fs.unlinkSync("deploy.tar.gz");

execSync(`tar -czf deploy.tar.gz ${paths.map((p) => JSON.stringify(p)).join(" ")}`, {
  stdio: "inherit",
});

const sizeMb = (fs.statSync("deploy.tar.gz").size / 1024 / 1024).toFixed(1);
console.log(`[deploy-pack] deploy.tar.gz (${sizeMb} MB)`);

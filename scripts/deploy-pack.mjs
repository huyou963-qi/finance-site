/**
 * 打包 CI 构建产物，供阿里云服务器解压运行（不在服务器上 next build）。
 * 不含 .env.local；服务器上需已存在环境变量文件。
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const required = [
  ".next",
  "node_modules",
  "package.json",
  "package-lock.json",
  "prisma",
  "next.config.ts",
  // tsx 数据脚本（data:apply / data:seed / data:worker …）在服务器运行需要 TS 源码 + 路径别名
  "tsconfig.json",
  "src",
  "scripts",
  // tsx 脚本从源码运行时按文件系统解析 JSON 导入（如 gicsIndustryCatalog → data/gics/*.json）。
  // next build 会把这些打进 .next 供 App 用，但服务器上的 tsx 脚本读的是源码路径，故必须一并打包。
  "data",
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

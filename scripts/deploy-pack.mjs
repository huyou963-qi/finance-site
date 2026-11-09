/**
 * 打包 CI 构建产物，供阿里云服务器解压运行（不在服务器上 next build）。
 * 不含 .env.local；服务器上需已存在环境变量文件。
 *
 * 产物拆成两份（详见 docs/ZERO_DOWNTIME_DEPLOY.md「依赖增量上传」）：
 *   deploy.tar.gz       应用包：.next（不含 cache/trace）、源码、脚本、prisma，
 *                       以及随 schema 变化的 node_modules/.prisma 生成客户端。每次部署都传。
 *   deploy-deps.tar.gz  依赖包：node_modules（不含 .prisma / .cache）。只由 package-lock.json
 *                       + .nvmrc + 平台决定，服务器已有同 key 的 /opt/finance-site-shared/deps/<key>
 *                       时 CI 不打也不传。
 * 两个包根目录都带 `.deploy-deps-key`，服务器据此找到/校验共享依赖。
 *
 * 用法：
 *   node scripts/deploy-pack.mjs              只打应用包（默认，CI 每次都跑）
 *   node scripts/deploy-pack.mjs --deps-only  只打依赖包（服务器缺该 key 时）
 *   node scripts/deploy-pack.mjs --with-deps  两个都打（CI 打包自检）
 *   node scripts/deploy-pack.mjs --print-key  只打印依赖 key
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

const APP_TARBALL = "deploy.tar.gz";
const DEPS_TARBALL = "deploy-deps.tar.gz";
const KEY_FILE = ".deploy-deps-key";
// 改依赖包的内容规则（排除项、布局）时递增，强制服务器重新装一份依赖。
const DEPS_FORMAT = "deps-v1";

const args = new Set(process.argv.slice(2));
const wantApp = !args.has("--deps-only");
const wantDeps = args.has("--deps-only") || args.has("--with-deps");

function depsKey() {
  const hash = crypto.createHash("sha256");
  hash.update(`${DEPS_FORMAT}\n`);
  hash.update(`${fs.readFileSync(".nvmrc", "utf8").trim()}\n`);
  // 原生依赖（sharp、prisma 引擎、swc）按平台安装，跨平台不可复用。
  hash.update(`${process.platform}-${process.arch}\n`);
  hash.update(fs.readFileSync("package-lock.json"));
  return hash.digest("hex").slice(0, 24);
}

const key = depsKey();
if (args.has("--print-key")) {
  console.log(key);
  process.exit(0);
}

function requirePaths(paths) {
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error(`[deploy-pack] missing required: ${p}`);
      process.exit(1);
    }
  }
}

function tar(out, paths, excludes = []) {
  if (fs.existsSync(out)) fs.unlinkSync(out);
  execFileSync(
    "tar",
    ["-czf", out, ...excludes.map((e) => `--exclude=${e}`), ...paths],
    { stdio: "inherit" },
  );
  const sizeMb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`[deploy-pack] ${out} (${sizeMb} MB) deps_key=${key}`);
}

fs.writeFileSync(KEY_FILE, `${key}\n`);
// 供 CI 读取，不进包。
fs.writeFileSync("deploy-deps-key.txt", `${key}\n`);

if (wantApp) {
  const required = [
    KEY_FILE,
    ".next",
    // prisma generate 的产物随 schema 变化，不能放进按 lockfile 复用的依赖包。
    "node_modules/.prisma",
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
  requirePaths(required);
  // .next/cache 是 webpack 增量构建缓存（本地可达 1GB+），运行时不需要；trace 是构建性能日志。
  tar(APP_TARBALL, [...required, ...optional.filter((p) => fs.existsSync(p))], [
    ".next/cache",
    ".next/trace",
  ]);
}

if (wantDeps) {
  requirePaths([KEY_FILE, "node_modules/next/dist/bin/next"]);
  tar(DEPS_TARBALL, [KEY_FILE, "node_modules"], [
    "node_modules/.prisma",
    "node_modules/.cache",
  ]);
}

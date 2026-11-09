import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

test("app tarball excludes the webpack build cache and ships node_modules separately", () => {
  const pack = read("scripts/deploy-pack.mjs");
  assert.match(pack, /"\.next\/cache"/);
  assert.match(pack, /"\.next\/trace"/);
  // Prisma 生成客户端随 schema 变化，必须在应用包里，不能进按 lockfile 复用的依赖包
  assert.match(pack, /"node_modules\/\.prisma",\r?\n/);
  assert.match(pack, /"node_modules\/\.prisma",\s*"node_modules\/\.cache"/);
  assert.match(pack, /package-lock\.json/);
  assert.match(pack, /\.nvmrc/);
});

test("shared deps are prepared before anything changes and linked before migrate", () => {
  const release = read("scripts/ops/deploy-release.sh");
  const ensure = release.indexOf("run_deps ensure");
  const extract = release.indexOf('tar -xzf "$TARBALL" -C "$RELEASE_PATH"');
  const link = release.indexOf("run_deps link");
  const migrate = release.indexOf("npm run db:migrate");
  const pm2Start = release.indexOf('pm2 start "$RELEASE_PATH/node_modules/next/dist/bin/next"');
  const prune = release.indexOf("run_deps prune");
  assert.ok(ensure > 0 && ensure < extract, "ensure must run before extraction / tarball removal");
  assert.ok(extract < link && link < migrate, "link must run after extraction, before migrate");
  assert.ok(migrate < pm2Start && pm2Start < prune, "prune only after release is live");
  assert.match(release, /exit 3/);
});

test("deploy workflow only uploads deps when the server lacks the key and retries on exit 3", () => {
  const deploy = read(".github/workflows/deploy.yml");
  assert.match(deploy, /deps\/\$\{DEPS_KEY\}/);
  assert.match(deploy, /need_deps == 'true'/);
  assert.match(deploy, /--deps-only/);
  assert.match(deploy, /RC\}" -eq 3/);
  assert.match(deploy, /scripts\/ops\/install-release-deps\.sh/);
});

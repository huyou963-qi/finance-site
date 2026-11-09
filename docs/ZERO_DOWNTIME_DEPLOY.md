# 零停机部署

生产发布不再 `pm2 stop` 后原地覆盖 `/opt/finance-site`。改由
`scripts/ops/deploy-release.sh` 在旁路准备新版本，**部署 smoke 通过后再切流量**；
切流后 smoke 失败则**自动回滚到上一 release**。

## 流程

1. CI 构建并上传应用包 `deploy.tar.gz` 到 `/opt/finance-site-shared/deploy.tar.gz`；
   依赖包 `deploy-deps.tar.gz` **仅在服务器缺同 key 共享依赖时**才打包上传（见下节）。
2. 解压到 `/opt/finance-site-releases/release-<id>/`（旧进程继续在原端口服务），
   `node_modules` 从 `/opt/finance-site-shared/deps/<key>/` 硬链接进 release。
3. 共享态（`.env.local`、`.data`、`logs`、静态 chunk archive）挂在
   `/opt/finance-site-shared/`，各 release 以符号链接引用。
4. 在 worker / calendar / sector / billing 锁内执行 `db:migrate`、`data:apply`
   （跳过长耗时回填）并同步 `/opt/finance-site-jp-data` 调度检出。
5. 在空闲端口（`3000` ↔ `3001` 交替）启动候选 PM2 进程 `finance-site-a|b`。
6. **切流前 smoke**（见下）；失败只删候选进程，旧站继续服务。
7. 写入 `/etc/nginx/conf.d/finance-site-upstream.conf` 并 `nginx reload` 切到新端口。
8. 停止旧 PM2 进程；将 `/opt/finance-site` 原子切换为指向新 release 的符号链接。
9. **切流后 smoke** + `equity:assert-seeded`；失败则 nginx / 符号链接 / PM2 全部指回上一 release。
10. 仅保留最近 2 个 web release（保证下一轮仍有可回滚副本）。

## 依赖增量上传

部署包拆成两份（`scripts/deploy-pack.mjs`）：

| 包 | 内容 | 何时上传 |
|---|---|---|
| `deploy.tar.gz` 应用包 | `.next`（**不含** `.next/cache`、`.next/trace`）、`src`、`scripts`、`data`、`prisma`、配置、`public`、`node_modules/.prisma`（随 schema 生成的 Prisma 客户端）、`.deploy-deps-key` | 每次 |
| `deploy-deps.tar.gz` 依赖包 | `node_modules`（不含 `.prisma`、`.cache`）+ `.deploy-deps-key` | 服务器缺该 key 时 |

**deps key** = sha256(`deps-v1` 格式号 + `.nvmrc` + 平台/架构 + `package-lock.json`) 前 24 位。只改代码、
schema 或数据的部署 key 不变；改 lockfile、升 Node（`.nvmrc`）或改依赖包规则（递增 `DEPS_FORMAT`）才会换 key。
`node_modules/.prisma` 刻意放在应用包里：它由 `prisma/schema.prisma` 生成，和 lockfile 无关。

### CI（`.github/workflows/deploy.yml`）

1. `Pack app tarball`：打应用包，输出 deps key。
2. `Check shared dependencies on server`：SSH 检查 `/opt/finance-site-shared/deps/<key>/.complete`
   内容等于 key 且 `node_modules/next/dist/bin/next` 存在。
3. 缺失（或手动 `workflow_dispatch` 勾选 `force_deps_upload`）才 `Pack dependency tarball` 并上传；
   不缺时删掉服务器上可能遗留的旧依赖包。传包逻辑在 `scripts/ci/deploy-upload.sh`（rsync 续传 + 3 次重试 + 远端大小/gzip 校验，与以前一致）。
4. `Zero-downtime release on server`：若 `deploy-release.sh` 以 **退出码 3** 结束（共享依赖在检查后丢失/不完整），
   CI 自动打包并上传依赖包后再发布一次。退出码 3 发生在解压之前，服务器没有任何改动，重试安全。

### 服务器（`scripts/ops/install-release-deps.sh`，由 `deploy-release.sh` 调用）

| 子命令 | 时机 | 行为 |
|---|---|---|
| `ensure <key>` | 第 0 步，解压之前 | 有匹配 key 的 `deploy-deps.tar.gz` → 解压到 `deps/.incoming-*`，校验关键文件后写 `.complete`，原子换入 `deps/<key>` 并删包；包内 key 不匹配 → 忽略并删包；没有包但 `deps/<key>` 完整 → 复用；都没有 → **exit 3** |
| `link <release> <key>` | 解压后、migrate 之前 | `cp -al` 把 `deps/<key>/node_modules` 硬链接进 release（跨文件系统退回 `cp -a`），断言 `next`/`@prisma/client`/`prisma`/`tsx`/`dotenv-cli` 与 `.prisma/client` 都在 |
| `prune` | 第 8 步，清理旧 release 之后 | 只保留现存 `release-*/.deploy-deps-key` 引用的 key；清掉超过 1 天的 `.incoming-*` / `.stale-*` |

不变量与边界：

- migrate / `data:apply` / 候选进程 / smoke / 切流 / 回滚的顺序与以前完全一致；新增步骤都在 migrate 之前。
- release 的 `node_modules` 与共享目录共用 inode：**不得在 release 里 `npm install`、`prisma generate` 或任何原地改写依赖文件**（会同时改到其它 release）。服务器本来就不允许改代码。
- 删除 `deps/<key>` 不影响已有 release（硬链接各自持有数据），所以回滚不依赖共享目录。
- 磁盘：共享依赖 + 2 个 release 的 `node_modules` 只占一份空间；换 key 时短暂多一份解压后的依赖，prune 后释放。
- 不带 `.deploy-deps-key` 的旧式整包（自带完整 `node_modules`）仍按原路径发布。
- `/opt/finance-site-jp-data` 调度检出照旧从 release 的 `node_modules` 复制（`sync-cron-checkout.sh` 未改）。
- 服务器运行时仍需要 devDependencies 里的 `tsx`、`prisma`、`dotenv-cli`（`db:migrate`、`data:*`、`equity:*` 与全部 cron 都经 `npm run` 调用），因此依赖包仍是完整的 `npm ci` 结果，没有 `--omit=dev`。

### 改代码时的约束

- 服务器运行时要读的新顶层目录/文件必须加进 `scripts/deploy-pack.mjs` 的打包列表（smoke 只覆盖 `next start`，不覆盖 tsx 脚本和 cron）。
- 由仓库文件生成、写进 `node_modules` 的产物只能进应用包（同 `node_modules/.prisma`）。
- 改依赖包内容规则时递增 `DEPS_FORMAT`。
- 加依赖只需改 `package.json` + lockfile，CI 自动上传新依赖包。

### 自检

- CI `build` job 的 `Deploy package smoke`（`scripts/ci/deploy-package-smoke.sh`）：打两个包并报告大小，
  断言应用包不含 `.next/cache`，按服务器布局跑 `ensure`/`link`/`prune`（含 exit 3、复用、硬链接 inode、删共享目录后 release 仍完整），
  并从解压出的 release 直接 `next start`（无构建缓存）验证能服务静态 chunk 和首页。
- 强制重传依赖：Actions → Deploy to production → Run workflow，勾选 `force_deps_upload`。

## 部署 smoke 覆盖

对候选端口（及回滚后的上一端口）依次断言：

| 路径 | 期望 |
|---|---|
| `GET /` | 2xx |
| `GET /api/health` | 200 且 `"ok":true`（含 DB ping） |
| `GET /api/tools/macro-chart-prefs` | 200 且含 `builtinTemplateOverrides` |
| `GET /markets` | 2xx/3xx（行情页可渲染） |
| `GET /api/auth/me` | **401** 且 `"user":null`（匿名契约） |
| `GET /api/data/instruments?kind=MACRO_SERIES&limit=1` | 200 且含 `total`（宏观 BFF） |

实现：`deploy_smoke` / `deploy_smoke_once`（`scripts/ops/deploy-release.sh`）。

## 回滚语义

| 阶段 | 行为 |
|---|---|
| 切流前 smoke 失败 | `rollback_cand`：删候选 PM2；nginx 未切，用户无感 |
| 切流后 smoke / equity seed 失败 | `rollback_to_previous`：upstream 改回上一端口，拉起上一 release 的 PM2，符号链接指回上一目录，再对上一端口做一次 smoke |
| 无上一 release（极端首发） | 无法自动回滚，脚本报错并留下现场日志 |

手工回滚（脚本未跑通时）：

```bash
# 假设上一 release 仍在 releases 目录
PREV=/opt/finance-site-releases/release-YYYYMMDD...
PREV_PORT=3000   # 或读 /opt/finance-site-shared/active-port 的对端
# 写 upstream 后 nginx -t && systemctl reload nginx
ln -sfn "$PREV" /opt/finance-site
pm2 start "$PREV/node_modules/next/dist/bin/next" --name finance-site-a --cwd "$PREV" -- start -p "$PREV_PORT"
```

## 预期与边界

- **用户侧**：切流前后页面应可持续打开；不是「发布瞬间完成」，migrate / seed 仍耗时。
- **内存**：切流瞬间新旧 Next 进程短暂并存（约多占数百 MB）；机器内存紧张时需关注。
- **破坏性 migration**：仍可能要求维护窗口；零停机与自动回滚都不消除不兼容 schema 变更风险——回滚代码无法撤销已执行的 migrate。
- **保留份数**：`KEEP_WEB_RELEASES` 默认 2；设为 1 会削弱自动回滚能力。
- **共享依赖**：`/opt/finance-site-shared/deps/<key>` 只是下一次部署的硬链接来源；`ls /opt/finance-site-shared/deps` 应只有现存 release 引用的 key。

## 运维检查

```bash
readlink -f /opt/finance-site
cat /opt/finance-site-shared/active-port
pm2 list
curl -fsS http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/api/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/markets
curl -sS http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/api/auth/me
```

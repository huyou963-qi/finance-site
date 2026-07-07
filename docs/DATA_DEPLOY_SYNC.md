# 宏观数据改动如何同步到云服务器

> 场景：每次（含 AI agent 会话）新增分析模板后，数据库多了指标、订阅、发布包、目录分类、历史观测等一系列东西，如何把这些同步到部署的云服务器。

## 核心认知：开发库是缓存，不是事实来源

一次会话的产出其实是 **5 类不同的东西**，存在不同地方、同步方式不同：

| 改动 | 真正存在哪 | 同步方式 |
|------|-----------|----------|
| 内置模板 / 图表定义 / 分析文档 | **代码（git）**——模板硬编码在 `.ts`，不在 DB（`SystemMacroChartPrefs` 只存管理员覆盖项） | 现有 `git→build→deploy` 已全自动，零额外操作 |
| Prisma schema（如新增表） | migrations（git） | `npm run db:migrate`（= `prisma migrate deploy`） |
| 指标 / 订阅 / 发布包 / 元数据 | DB，但**完全由 git 的 seed catalog 决定** | `npm run data:seed`（幂等 upsert）+ `data:seed-release-packages` |
| 目录分类布局 | DB（`MacroCatalogLayout`） | `npm run data:rebuild-us-catalog-layout`（`data:apply` 自动执行；仅替换 US，保留他国） |
| 历史观测值（几万行/序列） | DB，**来自 FRED** | 已运行的 `data:worker` 按 `nextRunAt` 自动全量回填 |

**关键**：开发库本身是靠跑这些 git 脚本生成的——它是缓存。事实来源是 **git 的 catalog 代码 + FRED**。所以云服务器只要跑同样的脚本，两边就**由构造而一致**：不需要 `pg_dump`/restore、不会有主键冲突、不会漂移。

**观测值自愈**：新指标 seed 时写入 `nextRunAt`；服务器已运行的 worker（每 5 分钟）下一轮捡起，`runDataSubscription` 对无 `lastObsDate` 的新订阅做 1950→今全量回填。所以观测**自动灌满，无需任何手动步骤或数据传输**。

## 一条命令：`data:apply`

`scripts/data-worker/apply-all.ts` 把整套后置 DB 操作按正确顺序串成一条幂等命令：

```
db:migrate                 # schema 迁移（前向非交互）
→ data:seed（遍历 SEED_CATALOG_REGISTRY 所有 catalog）  # 指标+订阅+发布规则
→ data:seed-release-packages                            # 发布包（在指标之后）
→ data:rebuild-us-catalog-layout                        # 美国目录 9 大类布局整表重建
→ data:sync-calendar                                    # 日历型包 → nextRunAt
→ data:backfill-empty --limit=150                       # 为「有订阅但零观测」的新指标强制拉历史
→ data:verify（遍历各域自检，排除噪音 verify-catalog）  # 门禁
```

**为什么需要 `data:backfill-empty`（而非 sync-all-stale）**：新 seed 的序列 `nextRunAt` 被设到未来（日频=次日），更新状态是 `on_schedule` 而非 `stale`，`sync-all-stale` 碰不到它们，worker 也要等到 `nextRunAt` 才拉。所以部署后若想让**新指标立刻有数据**（图表可见、verify 通过），必须按「观测为空」精准强制拉取。幂等（有数据后不再命中）、稳态零开销、`--limit` 有界避免拖住部署；未处理的剩余项由 worker 补齐。

它读 registry，所以**以后每加一个维度（housing、cycle-risk…）自动纳入，部署脚本一个字不用改**。

```bash
npm run data:apply                    # 全量落库（含新指标观测回填）
npm run data:apply -- --dry-run       # 只打印计划
npm run data:apply -- --only=monetary # 限定某域（包/布局/日历/回填仍全局幂等执行）
npm run data:apply -- --skip-backfill # 只落定义，观测交给 worker（部署更快）
npm run data:apply -- --skip-migrate --skip-verify  # 按需跳过
```

全部步骤幂等，可在每次部署后无脑重复执行。门禁步骤（•）失败即中止；自检类（◦）记录失败但跑完，末尾以非零退出让部署流水线感知。

## 已挂进部署流水线

`.github/workflows/deploy.yml` 在 `main` push 后自动：CI 构建 → `deploy.tar.gz` → `scp` 到 `/opt/finance-site` → 解压 → 落库 → `pm2 restart`。

服务器 SSH 块（节选）已包含：

```bash
tar -xzf deploy.tar.gz
npm run db:migrate || echo "[deploy] db:migrate 失败…"
npm run data:apply -- --skip-migrate || echo "[deploy] data:apply 有失败项…"
pm2 restart finance-site
```

`data:apply` 传 `--skip-migrate`，因前一步已单独跑过 `db:migrate`。两步失败**只打日志、不阻断重启**（末尾 `curl` 健康检查兜底）；若新指标无数据，请 SSH 查 deploy 日志并手动 `npm run data:apply`。

**全链路**：`git push main` → Actions 部署 → 生产库自动落库 → worker 按 `nextRunAt` 灌满剩余观测。

**前置条件**：服务器 `/opt/finance-site/.env.local` 需有 `DATABASE_URL` + `FRED_API_KEY`（worker 依赖）。

**勿在服务器 `git pull`**：生产以 tar 覆盖为准；目录里若有 `.git`，`git status` 会长期显示脏文件，可忽略或 `rm -rf .git`（见 [CONTRIBUTING.md](./CONTRIBUTING.md) §10）。

## 为什么不用 pg_dump / DB 同步

下策：开发库与生产库耦合、主键/序列冲突、无幂等、易漂移、还要处理增量。`data:apply` 从代码重建是上策——架构本就为此设计（seed 全是 upsert；美国目录布局由 `rebuild-us-catalog-layout` 按 taxonomy 整表重建，保留他国自定义布局）。

**例外**：若未来某指标**只能网页抓取且无法从源头重拉**（Agent C 场景中源站不留历史），那类观测才可能需要一次性 `pg_dump` 迁移——属例外，不是主路径。

# SAFE 批量调度与部署隔离

SAFE 发布包以数据集为抓取单位，使用一次官方工作簿快照。成员仍经过
`runDataSubscription` 和 `upsertMacroObservations`，保留窗口、200 点分块写入、
修订版本与逐成员 SUCCESS/SKIPPED/FAILED 记录。没有匹配到成员时报告失败。
所有成员处理完成后才提交包级排期；部分失败以最早成员排期重试，中断时未处理
成员继续保留到期状态。worker 与管理端发布包同步共用此路径。

部署先获取 worker 锁，再获取 calendar 锁，然后才覆盖网站依赖或执行迁移。
等待超过 1800 秒时失败，网站和 worker 保持旧版；禁止绕开锁重试。
GitHub 部署串行执行，后续提交不会取消正在发布的任务。

`sync-cron-checkout.sh` 创建 `/opt/finance-site-jp-data-releases/release-*`，
每个目录包含自己的源码与 node_modules；稳定入口 `/opt/finance-site-jp-data`
在锁内切换。首次迁移把原检出保留为 `legacy-*`，密钥只链接已有文件，
`.data` 优先挂到 `$RELEASE_ROOT/runtime-data`（稳定运行态缓存，不随 release 删除）。
不可变版本之间按内容硬链接相同依赖文件以减少重复存储，不与网站目录共享依赖文件。

磁盘回收：`scripts/ops/prune-worker-releases.sh`（默认 `--dry-run`，生产用
`--apply --keep 5`）在 worker/calendar 锁内：先把仍挂在 `legacy-*/.data` 的缓存
迁到 `runtime-data`，保留 active + 最近 N 个 `release-*`，删除更旧 release 与已迁空
的 legacy，并去掉站点旁路的一次性 `factor_snapshot_*.dump` / `next-build.tar.gz`。
部署 workflow 在 `sync-cron-checkout` 之后自动 `--apply --keep 5`。手动回滚仍用上一
个保留的 release，在同样双锁下 `mv -Tf` 切换稳定入口。

回滚：在同样的 worker/calendar 锁下，使用临时符号链接和 `mv -Tf` 将稳定入口
指向上一个 release；不得修改正在执行的目录。数据库变更必须兼容旧版运行代码；
删除字段、收紧约束等破坏性迁移需单独计划，本改动没有数据库 migration。

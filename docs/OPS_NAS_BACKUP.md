# 香港生产库 → 家里群晖 备份

香港生产机按计划在**本机**生成备份文件，家里 24 小时开机的群晖用**只读 rsync**限速拉走。零额外成本：香港按固定带宽计费，群晖已有。

## 为什么这样设计

| 事实（2026-11-10 实测） | 影响 |
|---|---|
| 香港公网出口约 **1 Mbps（≈120 KB/s）**，两条并行连接合计也一样，是机器上限而不是线路问题 | 跨境只能传压缩后的小文件，并且要限速，给网站留带宽 |
| 跨境跑 `pg_dump` 时，13MB 的业务库要 4 分钟，30KB 的单表要 70 秒（大部分时间在拉系统目录） | `pg_dump` 必须在香港本机跑（0.5 秒），跨境只传结果 |
| 全库 21GB，99% 在 `mds`；业务表 `public` 只有 13MB | 按「丢了能不能重建」分层，而不是整库一个频率 |
| WAL 约 4.6GB/天 | 不做 WAL 实时流复制（带宽不够）；改用 PG17 增量物理备份 |
| 香港盘剩 13GB | 香港只保留最近几份，群晖拉走后自动清理 |

**拉取模式**：群晖连香港，香港上没有任何能登录群晖的凭据。香港被入侵或误操作，也删不到家里的备份。群晖的 key 只能只读 rsync 一个目录：不能开 shell、不能转发端口，也不持有数据库口令。

## 备份了什么

| 层 | 内容 | 香港生成 | 体积 | 群晖保留 |
|---|---|---|---|---|
| app | `public`、`h` 两个 schema 全部（用户、订单、会员、模板、审计、文章、事件…）+ `mds.ownership_review`（人工裁定） | 每天 03:05 | 3.5MB | 30 天每天一份 + 之后周日那份留 12 周 |
| core | `mds` 全部表结构，以及除大表外的全部数据（宏观观测、版本账本、目录、订阅、发布包…）。大表见下 | 每周日 03:20 | 125MB | 12 份（约 3 个月） |
| physical | PG17 物理备份（整库含大表）：每月第一个周日全量，其余周日增量 | 每周日 03:40 | 全量约 5.6GB，增量待观测 | 最近 2 条链（约 2 个月） |
| files | `.env.local`、`/etc/nginx`、`/etc/postgresql`、`/etc/cron.d`、root crontab、`/root/deploy-bak` | 每天 02:55 | <1MB | 30 天（硬链接，几乎不占空间） |

core 层只留结构、不留数据的大表（可从 SEC/Yahoo/13F/DERA 等公开源重建，物理备份也已覆盖）：
`institutional_holding sec_filing equity_daily_bar dera_insider_transaction dera_insider_filing dera_insider_owner insider_transaction factor_snapshot equity_fundamental_snapshot fetch_run schedule_audit_event _bak_*`。
新增人工录入、不可重建的 `mds` 表，加到 `hk-nas-backup-produce.sh` 的 `APP_EXTRA_TABLES`。

**最多丢多少（RPO）**：业务数据 1 天；宏观等 `mds` 核心 1 周（多数可由 worker 从源头重新抓回）；大表 1 周（物理备份，均可从公开源重建）。频率按用户要求（2026-11-10）从每小时/每天下调。
**带宽**：香港→群晖实测约 50 KB/s（与网站共用 1 Mbps）。日常每天 3.5MB，周日约 130MB + 增量；首份全量 5.6GB 约需 1.5 天拉完，可断点续传。

## 代码位置

| 文件 | 在哪跑 |
|---|---|
| `scripts/ops/backup/hk-nas-backup-setup.sh` | 香港，root，一次性（幂等） |
| `scripts/ops/backup/hk-nas-backup-produce.sh` | 香港，装到 `/usr/local/sbin/nas-backup-produce.sh`，由 `/etc/cron.d/finance-nas-backup` 调用 |
| `deploy/synology-db-backup/` | 群晖 Container Manager 项目（`postgres:17-alpine` + rsync） |

香港侧细节：
- Linux 用户 `nasbackup`；数据库角色 `nasbackup`：`pg_read_all_data` + `REPLICATION`，unix socket peer 认证，没有口令，不能写、不能 DROP。
- `summarize_wal=on`、`wal_summary_keep_time=21d`（增量备份需要；reload 生效，不重启）。超过 21 天没做增量，会自动改做全量。
- 生成目录 `/var/backups/nas-export/{files,app,core,physical}`，日志 `/var/log/nas-backup.log`。
- 物理备份在本机读盘限速 30MB/s，以 `nice`/`ionice` 低优先级运行；空间不足（全量要 9GB、增量要 3GB）时直接报错，不会写满盘。
- 物理备份在香港保留 10 天。**群晖断线超过 10 天，增量链会断**，要等下个月全量自动重新起头，或手动执行 `nas-backup-produce.sh physical --full`。

## 群晖部署（一次性）

1. **建加密共享文件夹** `db-backup`（控制面板 → 共享文件夹 → 新增 → 勾选加密）。里面会有 `.env.local` 里的密钥。
2. **拷项目**：把 `deploy/synology-db-backup/` 整个目录拷到群晖（比如 `/volume1/docker/finance-db-backup/`）。如果共享文件夹路径不是 `/volume1/db-backup`，改 `compose.yaml` 的 volumes。
3. **建容器**：Container Manager → 项目 → 新增，路径选上面的目录，使用现有 `compose.yaml`，构建并启动。
4. **生成 key**：控制面板 → 任务计划 → 新增 → 计划的任务 → 用户自定义脚本，用户选 root，执行一次：
   ```bash
   docker exec finance-db-backup backup.sh init-keys
   ```
   核对输出里的香港 host key 指纹是 `SHA256:ZhF8zY70mG9EUePIYhaXSFg7J01RFZ9f2O5YbSATkpE`，然后把最后一行公钥（`ssh-ed25519 AAAA... nas-db-backup`）交给香港登记：
   ```bash
   bash /root/nas-backup/src/hk-nas-backup-setup.sh --pubkey "ssh-ed25519 AAAA... nas-db-backup"
   ```
5. **每小时任务**：任务计划 → 新增 → 计划的任务 → 用户自定义脚本，用户 root，每小时一次，命令：
   ```bash
   docker exec finance-db-backup backup.sh tick
   ```
   在「任务设置」里勾选**通过电子邮件发送运行详细信息 → 仅在脚本异常终止时**（需先在 控制面板 → 通知设置 配好邮件）。
6. **防备份被删**：套件中心装 **Snapshot Replication**（免费），给 `db-backup` 共享文件夹设每小时快照、保留 7 天，每天快照保留 30 天。快照只读：容器里的脚本或误操作都删不掉它。

`tick` 每小时做的事：
- 有新文件才拉 files/app/core（80 KB/s）；没有新文件时几秒结束。
- 后台拉取 physical（50 KB/s，同时只跑一份）。
- 每周日 08 点后跑逻辑恢复演练；每月第二个周日 10 点后，后台跑物理恢复演练。
- 每天 09 点、21 点检查各层是否过期。过期或失败时非零退出（会发 DSM 邮件），也会推送到 `ALERT_WEBHOOK_URL`（可选）。

手动命令：`backup.sh status | pull-small | pull-physical | drill | drill-physical`。

## 恢复

**先在临时库里恢复、确认无误再动生产，永远不要直接 `pg_restore --clean` 到生产库。** 把文件传回香港用你自己的 root key（群晖那把 key 是只读的）。香港入方向带宽比出方向大得多。

**某张业务表被误删/误改**（最常见）：
```bash
# 群晖上取最近一份 app，例如 /volume1/db-backup/app/20261110-0305/app.dump，传到香港后：
sudo -u postgres createdb restore_tmp
sudo -u postgres pg_restore -d restore_tmp --no-owner --no-privileges app.dump
# 核对 restore_tmp 里的数据后，按需把行拷回 finance，例如：
sudo -u postgres pg_dump -d restore_tmp -t 'public."SystemMacroChartPrefs"' --data-only | sudo -u postgres psql -d finance   # 先在 finance 清空/备份该表
sudo -u postgres dropdb restore_tmp
```
单独恢复一张表时，`pg_restore -t 表名` 也可以直接从 dump 里只取那张表。`mds` 核心表同理，用 core 层的 `mds-core.dump`；`mds.ownership_review` 的每日版本在 app 的 `extra-mds.ownership_review.dump`。

**整机损毁 / 库整体不可用**：用物理备份链在新机器上重建。
```bash
# 在群晖（或任何装了 PG17 的机器）上，取最新链：一份 *-full 加其后全部 *-incr，按时间顺序
for b in 20261102-0340-full 20261103-0340-incr ...; do
  mkdir -p x/$b/pg_wal; tar --zstd -xf physical/$b/base.tar.zst -C x/$b
  tar --zstd -xf physical/$b/pg_wal.tar.zst -C x/$b/pg_wal; cp physical/$b/backup_manifest x/$b/
done
pg_combinebackup -o restored x/20261102-0340-full x/20261103-0340-incr ...
pg_verifybackup restored
```
把 `restored` 作为新机器 `/var/lib/postgresql/17/main`（属主 postgres，权限 0700）。配置从 `files/current/etc-postgresql.tgz` 还原。启动后数据停在最后一份增量的时间点。再用 app 层把之后的业务表补上。`backup.sh drill-physical` 每月自动把这套流程跑一遍。

## 检查是否在正常工作

- 群晖：`docker exec finance-db-backup backup.sh status`
- 香港：`tail -50 /var/log/nas-backup.log`；`ls /var/backups/nas-export/*/`
- 观察增量体积（决定物理备份每天要传多少）：`du -sh /var/backups/nas-export/physical/*`

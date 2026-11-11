# 灾难恢复手册：香港生产服务器整机丢失

适用场景：香港服务器（8.218.16.70）无法恢复，例如被删、磁盘损坏或被入侵。目标是用**群晖备份 + GitHub 代码**在一台新机器上把站点恢复到最新可用状态。
备份怎么产生、存在哪，见 [OPS_NAS_BACKUP.md](./OPS_NAS_BACKUP.md)。

## 能恢复到什么程度

| 内容 | 来源 | 可能丢失 |
|---|---|---|
| 代码 | GitHub `main` | 不丢 |
| 用户、订单、会员、模板等业务表 | 群晖 `app/`（每天） | 最多 1 天 |
| 宏观等 `mds` 核心 | 群晖 `core/`（每周） | 最多 1 周；大部分可由 worker 从源头补回 |
| 大表（13F、SEC、日线、内部人交易） | 群晖 `physical/`（月全量 + 周增量） | 最多 1 周；没有物理备份时只能从公开源重建，需要几天 |
| `.env.local`、nginx、证书、crontab、SSH 公钥 | 群晖 `files/current/` | 最多 1 天 |

两种恢复方式：
- **物理恢复（`--physical`，首选）**：整库原样恢复，包括大表。前提是群晖上至少有一份完整的 `*-full`。
- **逻辑恢复（默认）**：只恢复业务表和 `mds` 核心，大表只有表结构，恢复后要在后台重建（见第 6 步）。

## 0. 先决定新机器

- 新开一台 **Ubuntu 22.04**，配置不低于原机（2 核 / 4GB / 50GB），地域选香港（中国大陆访问快，且不需要备案）。
- **记下新 IP。** 带宽建议买得比原来的 1 Mbps 大，原机的出口带宽是全站最大的瓶颈。
- 把**你自己的** SSH 公钥加到新机器的 root。恢复脚本会把原来的部署 key 合并进去，不会覆盖你自己的 key。

## 1. 从群晖取备份（在家里的电脑上）

打开群晖网页 → File Station → `db-backup`，下载下面这些，保持目录结构：

| 下载 | 说明 |
|---|---|
| `files/current/` 整个目录 | 必需。含 `.env.local` 等密钥，用完删掉本地副本 |
| `app/` 下最新一个目录 | 必需 |
| `core/` 下最新一个目录 | 必需 |
| `physical/` 下最新的 `*-full` 及其后所有 `*-incr` | 物理恢复时需要（约 6GB） |

在自己电脑上整理成：
```
restore/
  files/current/...
  app/20261110-0305/...
  core/20261108/...
  physical/20261101-0340-full/...  20261108-0340-incr/...   （物理恢复才需要）
```

## 2. 上传到新机器

```bash
scp -r restore root@<新IP>:/root/
scp -r scripts/ops/dr scripts/ops/backup root@<新IP>:/root/dr-scripts/
```
脚本取自本仓库。新机器上不需要 git，也不需要 GitHub 权限。

## 3. 一键恢复服务器

```bash
ssh root@<新IP>
bash /root/dr-scripts/dr/dr-restore.sh --bundle /root/restore --physical   # 有物理备份
# 或
bash /root/dr-scripts/dr/dr-restore.sh --bundle /root/restore              # 只有逻辑备份
```
脚本做的事（每一步都可重跑）：
1. 装 PostgreSQL 17、Node 20、nginx、pm2、certbot，开 2G swap，时区设为上海。
2. 还原 `/opt/finance-site-shared/.env.local`。
3. 恢复数据库。物理方式：解包、合并增量链、校验；逻辑方式：恢复业务表和 `mds` 核心，再补上每天更新的人工裁定表。
4. 还原 nginx 配置和 HTTPS 证书。
5. 还原 `china-proxy` 账号和 root 部署公钥。
6. 还原 crontab。
7. 设置 pm2 开机自启，开防火墙。

## 4. 发布代码

1. GitHub 仓库 → Settings → Secrets and variables → Actions：把 **`DEPLOY_HOST`** 改成新 IP。`DEPLOY_SSH_KEY` 不用改，对应的公钥已经在第 3 步恢复到新机器上了。
2. Actions → **Deploy to production** → Run workflow。第一次会自动上传依赖包，比平时多花几分钟。
3. 部署脚本会照常跑 `db:migrate` 和 `data:apply`，装好全部 `/etc/cron.d/finance-site-*`，启动站点并做健康检查。

## 5. 切换域名和证书

1. DNS：把 `gekkotech.cn`（以及 `www`）的 A 记录改成新 IP。
2. 生效后执行 `certbot renew --dry-run`，确认证书能续期。证书已从备份恢复，无需重新签发；如果已过期，执行 `certbot --nginx -d gekkotech.cn -d www.gekkotech.cn`。
3. 打开 https://gekkotech.cn ，登录一个账号核对数据。

## 6. 把周边接回新机器

- **群晖备份**：
  1. 在新机器上执行 `bash /root/dr-scripts/backup/hk-nas-backup-setup.sh --pubkey "$(群晖 /volume1/docker/finance-db-backup/keys/id_ed25519.pub 的内容)"`。
  2. 在群晖上把 `/volume1/docker/finance-db-backup/compose.yaml` 的 `HK_HOST` 改成新 IP，删除 `keys/known_hosts`，重新构建容器，再执行 `docker exec finance-db-backup backup.sh init-keys`，核对新机器的 host key 指纹。
- **中国官网代理**：群晖 `/volume1/docker/synology-china-official-proxy/compose.yaml` 的 `HK_HOST` 改成新 IP，删除旧的 `known_hosts` 后重建容器。`china-proxy` 的公钥已经恢复，不用重新登记。
- **大表重建**（仅逻辑恢复需要）：在新机器 `/opt/finance-site` 下，于后台依次执行：
  ```bash
  npm run equity:sync-prices                 # 日线（分批，跑多次直到覆盖完）
  npm run equity:sync-dera-insider           # DERA 内部人交易全量，约 73 分钟
  ```
  13F 持仓、SEC 申报、Form 4 证据等由 `/etc/cron.d` 里的定时任务逐日补齐；要尽快补全，见各自文档（`US_EQUITY_HISTORY_COVERAGE.md`、`OWNERSHIP_SUPPLY_MONITOR.md`）。
- **旧机器**：如果是被入侵，到阿里云控制台释放它，并轮换 `.env.local` 里的全部密钥（FMP、FRED、SMTP、ZPAY、ADMIN 等）。

## 7. 收尾检查

- [ ] `curl -fsS https://gekkotech.cn/api/health` 返回 `"ok":true`
- [ ] 能登录；后台 `/admin/users` 能看到用户
- [ ] 宏观页、行情页、行业页都有数据
- [ ] 群晖上 `docker exec finance-db-backup backup.sh status` 显示 app/core 正常
- [ ] `crontab -l` 和 `/etc/cron.d/finance-*` 都在；`tail /var/log/nas-backup.log` 有新记录
- [ ] 本地电脑上下载的 `restore/` 已删除（里面有密钥）

## 演练

每年至少演练一次，或在部署方式有大的改动后演练。演练机是群晖上的一个一次性 Ubuntu 容器（Container Manager 项目 `dr-rehearsal`，compose 见本文末尾），它只读挂载 `db-backup`，不碰生产：

```bash
ssh -p 22922 root@192.168.1.12
bash /root/dr-scripts/dr/dr-restore.sh --bundle /restore --rehearsal --tarball /root/deploy.tar.gz --deps-tarball /root/deploy-deps.tar.gz
```
`--rehearsal` 会清空发信、支付、OAuth、Webhook 和代理变量，关闭 cron，并跳过防火墙和 swap。演练机上不会发生任何对外动作。
`deploy.tar.gz` 取自 GitHub Actions 最近一次成功部署的制品（`gh run download <run-id> -n deploy-tarball`）。`deploy-deps.tar.gz` 要在演练机里用同一版源码执行 `npm ci && node scripts/deploy-pack.mjs --deps-only` 生成，因为它包含 Linux 原生模块，必须在 Linux 上打包。
⚠ 在 Windows 上打源码包要用 `git -c core.autocrlf=false archive ...`。否则 `package-lock.json` 会被转成 CRLF，依赖 key 和部署包对不上，部署脚本会报找不到共享依赖。

验收（演练机上）：
```bash
for p in / /api/health /macro /markets /equity/sectors; do curl -sk -o /dev/null -w "$p %{http_code}\n" -H "Host: gekkotech.cn" https://127.0.0.1$p; done
```

演练完删除演练机：Container Manager → 项目 `dr-rehearsal` → 停止 → 删除，再删掉 `/volume1/docker/dr-rehearsal`。

### 演练记录

| 日期 | 方式 | 结果 | 耗时 | 发现并已修复的问题 |
|---|---|---|---|---|
| 2026-11-10 | 逻辑恢复（app 20261110-1816 + core 20261110）+ 生产同款部署脚本 | ✅ 通过：nginx+HTTPS 下 5 个页面全部 200，`/api/health` 正常，用户 86、宏观观测 147 万行，`equity:assert-seeded` 通过 | 装软件 20 分钟（群晖访问 Ubuntu 源慢，云服务器通常 2–3 分钟）；恢复数据库 5 分钟；部署 93 分钟（大部分时间花在 `data:apply` 从各数据源重新拉数） | ① 备份放在 `/root` 下，postgres 用户读不到 → 先复制到临时目录；② 中途失败留下的空库会被误判为「已恢复」，脚本一路「成功」到底 → 改为检查核心表，空库自动删掉重来，恢复后行数为 0 直接报错；③ Windows 打源码包会改成 CRLF，导致依赖 key 不一致（见上） |

**按这次演练估算真实恢复耗时**：新机器约 3 小时可以对外服务，其中开机和下载备份约 30 分钟，脚本约 30 分钟，部署约 1.5 小时，改 DNS 生效约 10 分钟。逻辑恢复时大表要在之后 1–3 天内于后台补齐。

### 演练机 compose（Container Manager → 项目 → 新增 → 创建 docker-compose.yml，路径 `/docker/dr-rehearsal`）

把 `<你的 SSH 公钥>` 换成操作电脑的公钥（建议单独生成一把，例如 `ssh-keygen -t ed25519 -f ~/.ssh/dr_rehearsal_ed25519`）。容器是特权模式（为了跑 systemd），创建时需要你本人在 DSM 里确认；演练完就删掉。

```yaml
services:
  dr-rehearsal:
    image: jrei/systemd-ubuntu:22.04
    container_name: dr-rehearsal
    hostname: dr-rehearsal
    privileged: true
    cgroup: host
    tmpfs:
      - /run
      - /run/lock
    volumes:
      - /sys/fs/cgroup:/sys/fs/cgroup:rw
      - /volume1/db-backup:/restore:ro
    ports:
      - "22922:22"
      - "28080:80"
      - "28443:443"
    entrypoint:
      - /bin/bash
      - -c
      - >-
        set -e;
        if ! command -v sshd >/dev/null; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server >/dev/null; fi;
        mkdir -p /root/.ssh;
        echo '<你的 SSH 公钥>' > /root/.ssh/authorized_keys;
        chmod 700 /root/.ssh; chmod 600 /root/.ssh/authorized_keys;
        systemctl enable ssh >/dev/null 2>&1 || true;
        exec /lib/systemd/systemd
```
启动后约 2 分钟能 SSH 上去：`ssh -i ~/.ssh/dr_rehearsal_ed25519 -p 22922 root@192.168.1.12`。

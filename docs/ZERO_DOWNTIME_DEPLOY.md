# 零停机部署

生产发布不再 `pm2 stop` 后原地覆盖 `/opt/finance-site`。改由
`scripts/ops/deploy-release.sh` 在旁路准备新版本，健康检查通过后再切流量。

## 流程

1. CI 构建并上传 `deploy.tar.gz` 到 `/opt/finance-site-shared/deploy.tar.gz`。
2. 解压到 `/opt/finance-site-releases/release-<id>/`（旧进程继续在原端口服务）。
3. 共享态（`.env.local`、`.data`、`logs`、静态 chunk archive）挂在
   `/opt/finance-site-shared/`，各 release 以符号链接引用。
4. 在 worker / calendar / sector / billing 锁内执行 `db:migrate`、`data:apply`
   （跳过长耗时回填）并同步 `/opt/finance-site-jp-data` 调度检出。
5. 在空闲端口（`3000` ↔ `3001` 交替）启动候选 PM2 进程 `finance-site-a|b`。
6. 探活：`/`、`/api/health`（DB）、`/api/tools/macro-chart-prefs`。
7. 写入 `/etc/nginx/conf.d/finance-site-upstream.conf` 并 `nginx reload` 切到新端口。
8. 停止旧 PM2 进程；将 `/opt/finance-site` 原子切换为指向新 release 的符号链接。
9. 仅保留最近 2 个 web release。

## 预期与边界

- **用户侧**：切流前后页面应可持续打开；不是「发布瞬间完成」，migrate / seed 仍耗时。
- **内存**：切流瞬间新旧 Next 进程短暂并存（约多占数百 MB）；机器内存紧张时需关注。
- **破坏性 migration**：仍可能要求维护窗口；零停机不消除不兼容 schema 变更风险。
- **回滚**：nginx upstream 改回上一端口，或把 `/opt/finance-site` 指回上一 release 并启动对应 PM2（需保留的 release 尚未被 prune）。

## 运维检查

```bash
readlink -f /opt/finance-site
cat /opt/finance-site-shared/active-port
pm2 list
curl -fsS http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/api/health
```

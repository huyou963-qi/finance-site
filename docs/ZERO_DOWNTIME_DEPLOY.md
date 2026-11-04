# 零停机部署

生产发布不再 `pm2 stop` 后原地覆盖 `/opt/finance-site`。改由
`scripts/ops/deploy-release.sh` 在旁路准备新版本，**部署 smoke 通过后再切流量**；
切流后 smoke 失败则**自动回滚到上一 release**。

## 流程

1. CI 构建并上传 `deploy.tar.gz` 到 `/opt/finance-site-shared/deploy.tar.gz`。
2. 解压到 `/opt/finance-site-releases/release-<id>/`（旧进程继续在原端口服务）。
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

## 运维检查

```bash
readlink -f /opt/finance-site
cat /opt/finance-site-shared/active-port
pm2 list
curl -fsS http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/api/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/markets
curl -sS http://127.0.0.1:$(cat /opt/finance-site-shared/active-port)/api/auth/me
```

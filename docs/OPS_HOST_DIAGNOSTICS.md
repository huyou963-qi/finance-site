# 主机卡死诊断落盘（轻量服务器）

问题：CPU/内存打满后 SSH/VNC 进不去，强制重启后现场丢失。  
方案：定时写**心跳**；资源吃紧时写**详细 incident**；开机捞**上一启动的 OOM**。

脚本随部署包在 `scripts/ops/`（`deploy-pack` 已包含 `scripts/`）。

## 一次安装（服务器 root）

```bash
chmod +x /opt/finance-site/scripts/ops/host-diagnostics-*.sh
mkdir -p /opt/finance-site/logs/diagnostics

# 让 journal 跨重启保留（OOM 证据）
mkdir -p /var/log/journal
grep -q '^Storage=' /etc/systemd/journald.conf 2>/dev/null \
  || sed -i 's/^#Storage=.*/Storage=persistent/' /etc/systemd/journald.conf
# 若仍是注释，手动保证有一行：Storage=persistent
systemctl restart systemd-journald

crontab -e
```

加入：

```cron
*/2 * * * * /opt/finance-site/scripts/ops/host-diagnostics-snapshot.sh
@reboot sleep 30; /opt/finance-site/scripts/ops/host-diagnostics-boot.sh
```

可选手动跑一次确认：

```bash
/opt/finance-site/scripts/ops/host-diagnostics-snapshot.sh
tail -5 /opt/finance-site/logs/diagnostics/heartbeat.log
```

## 重启后怎么查

```bash
# 1) 卡死前内存/负载走势
tail -100 /opt/finance-site/logs/diagnostics/heartbeat.log

# 2) 压力时的进程/pm2/postgres/nginx 现场
ls -lt /opt/finance-site/logs/diagnostics/incidents/ | head
cat /opt/finance-site/logs/diagnostics/incidents/LATEST

# 3) 上一启动内核是否 OOM kill
cat /opt/finance-site/logs/diagnostics/boot/LATEST

# 4) 应用被杀痕迹
tail -100 /root/.pm2/logs/finance-site-error.log | grep -E 'Killed|Error'
```

## 阈值（可用环境变量改）

| 变量 | 默认 | 含义 |
|------|------|------|
| `MEM_WARN_PCT` | 85 | 内存使用 ≥ 此 % 打 incident |
| `SWAP_WARN_MB` | 64 | swap 已用 ≥ 此 MB |
| `LOAD_WARN_MULT` | 1.5 | load1 ≥ ncpu×此值 |
| `ALERT_COOLDOWN_SEC` | 120 | incident 最短间隔 |
| `KEEP_DAYS` | 14 | incident 保留天数 |

例：`MEM_WARN_PCT=80 SWAP_WARN_MB=32 /opt/finance-site/scripts/ops/host-diagnostics-snapshot.sh`

## 注意

- 机器已完全卡死时，cron 也可能停跑；价值在于**卡死前几分钟到几十分钟**的心跳与 incident。
- 不要把 `logs/diagnostics/` 提交进 git；仅服务器落盘。

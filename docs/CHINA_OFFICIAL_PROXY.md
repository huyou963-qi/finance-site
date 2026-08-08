# 中国官方数据大陆代理

香港服务器直连财政部、国家统计局可能被境外 CDN 节点返回 502。此方案保持抓取、解析、数据库和日志均在香港，只让中国官方 HTTP(S) 请求从大陆群晖出口。

## 连接拓扑

```
香港 data:worker -> 127.0.0.1:18080 (SSH 反向隧道)
                 -> 群晖 127.0.0.1:3128 (HTTP CONNECT proxy)
                 -> gks.mof.gov.cn / *.stats.gov.cn
```

群晖主动向香港建立 SSH 连接，因此不需要在群晖路由器、防火墙或域名上开放代理端口。

## 项目配置

在香港 `/opt/finance-site/.env.local` 设置：

```dotenv
CHINA_OFFICIAL_PROXY_URL=http://127.0.0.1:18080
```

代码仅让 `gks.mof.gov.cn`、`data.stats.gov.cn` 和 `*.stats.gov.cn` 通过该代理；未配置该变量时保持直连。代理不可用会在 fetch run 中记录明确错误，不能静默回退到境外直连。

## 群晖部署要求

1. 在 Container Manager 的「项目」中导入仓库 `deploy/synology-china-official-proxy/compose.yaml`。该容器内置 tinyproxy，只监听容器自身 `127.0.0.1:3128`，不会映射或开放群晖端口。
2. 在香港创建只用于隧道的非 root SSH 用户和密钥；禁止密码登录、PTY、agent/X11 转发，并限制远端监听地址为 `127.0.0.1:18080`。
3. 创建 `keys/id_ed25519` 和 `keys/known_hosts` 后，项目中的 autossh 会自动维持：

```bash
ssh -N -R 127.0.0.1:18080:127.0.0.1:3128 collector@8.218.16.70
```

4. 在香港检查：

```bash
ss -ltnp | grep 18080
curl -x http://127.0.0.1:18080 -I https://gks.mof.gov.cn/tongjishuju/
```

预期代理端口只绑定 `127.0.0.1`，且第二个命令返回官方站点的 200/3xx，不应返回香港直连时的 502。

不要把群晖公网域名或任意端口配置为公开代理，也不要将香港整机默认路由切到群晖。

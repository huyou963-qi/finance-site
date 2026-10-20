# Chunk 加载失败调查与日志

## 2026-09-25 两条反馈（2026-10-08 在香港服务器调查）

截图反馈时间为北京时间 16:26:14（layout）和 16:26:20（5525），UA 为 iPhone EdgiOS/153。
匹配 Nginx `access.log.13.gz` 中同一客户端、UA、`/macro` 来源和 POST `/api/error-reports`：

| 时间 | 请求 | HTTP | body_bytes_sent |
| --- | --- | --- | --- |
| 16:26:05 | layout-626fe126c44acd47.js | 200 | 14887 |
| 16:26:14 | layout-626fe126c44acd47.js | 200 | 14902 |
| 16:26:14 | 5525-4df2c5688dbd4b81.js | 200 | 65148 |
| 16:26:16 | 5525-4df2c5688dbd4b81.js | 200 | 65148 |
| 16:26:20 | 5525-4df2c5688dbd4b81.js | 200 | 65148 |
| 16:26:32 | 5525-4df2c5688dbd4b81.js（来源为首页） | 200 | 90154 |

同日其他客户端该 5525 文件的发送量通常约 90 KB。重复的 65148 字节值得调查，但旧日志未记录编码、上游完整大小、完成标志和耗时，不能单靠发送量认定截断。
200 只证明已发送成功响应头，不证明浏览器完整收到、解析和执行了脚本。
同一分钟 Nginx error 日志没有匹配项。PM2 最后一次启站是 15:28:18，16:26 无停止/重启记录。因此这两次没有直接证据支持发布停站或静态文件 404。
目前候选原因包括客户端取消/传输中断、压缩或缓存异常、脚本解析/执行失败，尚不能最终归因。
原始当天 access/error 压缩日志已复制到本机 `.codex-artifacts/chunk-investigation-20261008/`，包含访问者信息，不应公开提交。

## 已在 HK 启用的诊断日志

- 配置来源：`scripts/ops/finance-site-asset-diagnostics.conf`。
- 路径：`/var/log/nginx/finance-site-assets.jsonl`；只记录 `_next/static`、`/macro`、错误上报请求。
- 保留普通 access/error 日志；新增 JSON 日志每天轮转、保留 60 份，由 `finance-site-asset-diagnostics.logrotate` 配置。
- 字段包含请求 ID、时间/主机/UA、状态、请求完成标志、发送量、上游响应量/Content-Length、耗时、压缩编码和 ETag。不记录 query、cookie、认证头或 body。
- 配置安装于 `/etc/nginx/conf.d/finance-site-asset-diagnostics.conf`；修改后先 `nginx -t`，再 `systemctl reload nginx`，无需重启应用。
- 2026-10-08 实际请求验证：200、complete=OK、上游和发送量均 246806、耗时 0.071 秒；JSON 可解析，原普通 access 日志继续写入。这个验证是日志可用性验证，不是对旧故障的复现。

## 随下次代码发布启用的浏览器证据

现有错误反馈 metadata 增加 `assetDiagnostics`：浏览器时间、在线/可见状态、页面存活时间、上次自动刷新时间、webpack runtime 哈希及匹配资源的 ResourceTiming 大小/耗时/协议/状态。
浏览器不支持的状态字段为 null；缓存命中或浏览器隐私限制可能使大小为零，不能将零直接解释为失败。
只增强已有上报，不额外探测网络、不修改自动刷新行为。自动刷新成功而未上报的事件仍仅有 Nginx 证据；客户端尚未执行或完全断网时也无法保证即时上报。
验证：新增客户端文件 ESLint、依赖安装完成后的全量 TypeScript 检查及 `npm run build` 均通过（95 个静态页）。HK 的 `nginx -t`、logrotate debug、正常/压缩/404 实际请求及 JSON 解析验证均通过。浏览器代码未直接覆盖生产业务文件，随正常代码发布生效。

## 下次定位顺序

1. 按反馈时间（注意 +08:00）、资源路径、UA、主机匹配 JSON 日志和普通 access/error 日志，核对 PM2 启停记录。
2. 404 指向资源保留/版本问题；502/连接失败与 PM2 停站重合则指向部署窗口。
3. 200 时比较 upstream_bytes、上游长度、压缩编码、body_bytes 和 complete；压缩后的发送量不能直接与未压缩长度比较。complete 非 OK 是未完成的线索，OK 也不能保证浏览器最终成功执行。
4. 结合浏览器资源 timing、runtime 哈希和语法错误调查解析、缓存与传输问题。证据仍不足时继续补采，不把所有 ChunkLoadError 一律归因于部署。

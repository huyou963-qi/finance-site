# 功能页权限校验连接池超时

## 2026-10-10 持股监控页面崩溃

用户报告 `/equity/ownership` 在 19:42:13（北京时间）发生 Server Components render 错误，digest 为 `3662686145`。

生产 `/root/.pm2/logs/finance-site-error.log` 中有相同 digest：

```text
Invalid prisma.session.findUnique() invocation
Timed out fetching a new connection from the connection pool
Current connection pool timeout: 10, connection limit: 3
code: P2024
digest: 3662686145
```

异常来自权限校验读取会话，而非持股计算。`FeatureGate` 原先直接等待校验，数据库临时超时会冒泡为服务端渲染错误。日志不能单独证明当时是哪条查询占用了连接。

## 修复行为

- `src/lib/prisma.ts` 在生产与开发环境均复用进程级 Prisma 实例，避免重复加载模块创建额外连接池。
- cookie 身份解析使用 React 请求级缓存；不跨请求缓存会话或权限。
- 页面守卫仅对 `P1001/P1002/P1017/P2024` 返回中文服务繁忙提示和重试按钮，不渲染受保护页面、不将故障当成游客。重试重新执行服务器权限校验。
- 其他错误仍抛出，避免掩盖程序错误、迁移缺失和 Next.js 控制流。
- 故障日志仅包含功能 ID 与错误码，不输出 cookie、连接串或完整查询。

## 验证与排查

回归测试：`npx tsx --test src/lib/access/featureGateAvailability.test.ts src/lib/access/featureCatalog.test.ts`。

若重复发生，先查同一时间段的应用日志、`pg_stat_activity` 中的长查询和锁等待，以及 worker/部署任务是否并发占用数据库。结合数据库容量再调整 `DATABASE_URL` 中的 `connection_limit`；不要仅延长 `pool_timeout` 或关闭权限校验。

此修复不含数据库迁移。按仓库正常 PR/部署流程发布后生效。

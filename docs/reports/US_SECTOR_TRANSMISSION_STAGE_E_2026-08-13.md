# 美国行业传导阶段 E 验收报告

> 验收日期：2026-08-13  
> 定义版本：`2026-08-13.d3`  
> 结论：通过；历史严格事实缺口保持显式降级，不以当前数据倒填历史。

## 1. 自动数据验收

| 项目 | 结果 |
|------|------|
| 历史阶段 | 30/30 |
| 响应组合 | 30×`asOf`×2 聚合 + 3×`realized`×2 聚合 = 66 |
| 行业行 | 726 |
| 行业完整性 | 每个响应固定 11 行业，顺序为成长→周期→防御 |
| 日期边界 | T0≤S、T1≤E、T1≤T2≤T1+120 日 |
| 覆盖率 | 质量层、指标层、三层事实端点全部落在 [0,1] |
| 收益桥 | 所有开放桥均满足 ≥60% 覆盖并精确加总到 ETF 对数总回报 |
| 分类有效期 | 无 `validTo<validFrom`、无重叠、无重复开放区间 |
| 严格/降级 | 历史 726 行全部回退 D1；没有半严格混用，也没有误报 A 级 |

历史严格应用数为 0 不是失败：当前只有 2026-08-11 起的真实持仓/GICS 观察，不能倒填到既有阶段 T0。当前 XLK 试点单端点已通过严格链：filing vintage 覆盖 93.4%，历史 GICS 命中 99.9%，最晚使用 filing date 2026-08-07≤T。

## 2. 性能与体积

| 项目 | 实测 | 目标 |
|------|-----:|-----:|
| 最大响应 | 80.2KB | <150KB |
| 内部冷查询 p95 | 318.5ms | <1,000ms |
| 内部热命中 p95 | <1ms | <200ms |
| HTTP 热请求 | 81.5ms | <200ms |

三层事实闸门已由逐 ETF 查询改为批量读取；数据版本指纹增加 5 秒短 TTL。数据变更仍会使 5 分钟响应缓存换键失效，而同一页面的连续请求不再为版本指纹重复查询七张表。

开发服务器第一次 HTTP 请求为 2.37 秒，包含 Next.js 按需编译，不作为生产接口冷查询指标。

## 3. HTTP 契约

| 场景 | 结果 |
|------|------|
| 有效阶段 | 200，11 行业，`definitionsVersion=2026-08-13.d3` |
| 非法 mode | 400 / `INVALID_MODE` |
| 非法 aggregation | 400 / `INVALID_AGGREGATION` |
| 非法 sector | 400 / `INVALID_SECTOR` |
| 未知 stageId | 404 / `STAGE_NOT_FOUND` |
| 缓存头 | `public, max-age=60, stale-while-revalidate=300` |

## 4. 视觉与交互

| 场景 | 结果 |
|------|------|
| 1440px | 页面宽度 1440px，无页面级横向溢出 |
| 默认 822px | 页面宽度 822px，无页面级横向溢出 |
| 390px | 页面宽度严格为 390px；传导区 357.6px |
| 11 行业矩阵 | 窄屏滚动容器 342px，内容 1420px，只在组件内横向滚动 |
| 收益桥 | 390px 下五项纵向排列，无裁切 |
| 模式 | `asOf↔realized` 同步 T1/T2、风险提示与 URL |
| 聚合 | `median↔capWeighted` 同步收益桥与 URL |
| 行业联动 | 选择行业同步详情、URL 与主图 ETF 可见性 |
| 排序 | 风格固定顺序与按超额排序可逆切换 |
| 刷新恢复 | stage/sector/mode/aggregation 全部保留 |
| 控制台 | 最终新页面无 error |

## 5. 重复验收命令

```bash
npm run equity:verify-sector-history-facts
npm run equity:verify-sector-strict-history -- --date=2026-08-11 --etf=XLK
npm run equity:verify-sector-transmission
npm run equity:verify-sector-stage-e
npm run dev
npm run equity:verify-sector-stage-e-http
```

阶段 E 只确认研究链和产品实现符合既定口径，不证明 Regime 具有样本外预测力。该问题进入阶段 F。

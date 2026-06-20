# Phase 5：usov 补全、 e-Stat 试点、告警增强

## 任务清单

| # | 任务 | 交付 |
|---|------|------|
| 5.1 | usov 剩余 FRED | `USOV_FRED_PHASE5_EXTRA` + `seed-phase5` |
| 5.2 | usov 复合序列 | `usovCompositeFred.ts` + `fredComposite.ts` |
| 5.3 | 日本 e-Stat 试点 | `eStatAdapter.ts` + `estat-jp` 订阅 |
| 5.4 | 告警去重 + Slack | `lagAlertDedup.ts` + `slackNotify.ts` |
| 5.5 | 自检 | `npm run data:verify-phase5` |

## CLI

```bash
npm run data:seed-phase5
npm run data:seed-phase5 -- --dry-run
npm run data:seed-phase5 -- --estat --replace-xlsx   # 试点切换 jpov 源
npm run data:verify-phase5 -- --db
```

## usov 自动覆盖（26/28）

**直拉 FRED（Phase 2+5）**：19 + 2 = 21 条  
**复合 FRED（spread/ratio/wow）**：5 条  

仍依赖 xlsx / 手工：

- `usov_c14_ism_nm_pmi`（ISM 非制造业，FRED 无稳定免费序列）
- `usov_c28_sp500_pe`（标普 PE，需 FMP 或 xlsx）

复合示例：

- `usov_c12_2y_effr` = GS2 − EFFR
- `usov_c27_fed_net_liquidity` = WALCL − TREAST（简化代理）

## e-Stat（日本）

```bash
ESTAT_APP_ID=your_app_id   # https://www.e-stat.go.jp/api/
npm run data:seed-phase5 -- --estat
npm run data:worker -- --source=estat-jp --force
```

试点序列：`jpov_c09_cpi_yoy`、`jpov_c21_unrate_sa`（YoY 在 worker 内计算）。

## 告警

```bash
DATA_LAG_ALERT_COOLDOWN_HOURS=24
DATA_LAG_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
# 或 DATA_LAG_WEBHOOK_URL 指向 Slack incoming webhook
```

管理页：**滞后检测**（dry-run） / **发送告警**（force，跳过去重）。

状态文件：`.data/lag-alert-state.json`

## Phase 6 预览

- 中国 NBS 开放接口 / SDMX 适配
- usov ISM 非制造业、标普 PE 第三方源
- e-Stat / xlsx 双源校验与自动切换

# Phase 4：Overview 重导、滞后告警、日历映射

## 任务清单

| # | 任务 | 交付 |
|---|------|------|
| 4.1 | jpov/chov xlsx 适配器 | `overviewXlsxAdapter.ts` + `BULK_FILE` worker |
| 4.2 | Phase 4 seed | `npm run data:seed-phase4`（chov/jpov/m_ 订阅） |
| 4.3 | 滞后告警 | `lagAlerts.ts` + 邮件/webhook |
| 4.4 | 日历映射管理 | `.data/calendar-mapping-overrides.json` + Admin API/UI |
| 4.5 | 自检 | `npm run data:verify-phase4` |

## CLI

```bash
npm run data:seed-phase4
npm run data:seed-phase4 -- --dry-run
npm run data:verify-phase4 -- --db
npm run data:worker -- --source=overview-china --force
```

## 环境变量

```bash
# Overview xlsx 路径（默认 Desktop 模板路径 + 项目根 China/Japan_Overview.xlsx）
CHINA_OVERVIEW_XLSX_PATH=
JAPAN_OVERVIEW_XLSX_PATH=

# 滞后告警
DATA_LAG_DAYS_THRESHOLD=14
DATA_LAG_ALERT_EMAIL=ops@example.com
DATA_LAG_WEBHOOK_URL=https://hooks.example.com/...
DATA_LAG_ALERT_AFTER_WORKER=1   # worker 结束后自动检测并通知
```

## 管理页（/admin/data-catalog）

- **跑 Overview xlsx** → 到期 overview-china/japan 订阅
- **重导中国/日本 xlsx** → force 全量重读 xlsx 入库
- **滞后检测** → dry-run 列出告警（不发邮件）
- **日历映射** → 编辑 FRED→Investing 关键词覆盖，保存后执行「刷新经济日历」

## legacy m_

`m_*` 仪器登记为 `legacy-m` + `MANUAL` 发布规则，worker 默认跳过；仅用于目录追踪与 probe。

## Phase 6 预览

- 中国 NBS 开放接口
- usov ISM 非制造业 / 标普 PE 第三方源
- e-Stat 与 xlsx 双源校验

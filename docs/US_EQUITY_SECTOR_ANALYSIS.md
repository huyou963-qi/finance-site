# 美股行业分析（GICS Sector）

> 页面：`/equity/sectors` · 详情：`/equity/sectors/[sector]`  
> 与宏观「制造业与库存周期」(`industry-inventory`) **不同域**：本模块是 **股权 GICS 行业**，后者是宏观制造业周期。

## 回答的问题

| 问题 | 证据 |
|------|------|
| 哪些行业占优？ | Sector ETF vs SPY 相对收益 + 排行 |
| 成长 / 周期 / 防御谁强？ | 预置风格篮子等权超额收益 |
| 宏观是否支持？ | `sectorMacroMap` → 已有 `fred:`/`mds:` 序列 |
| 基本面是否支持？ | 行业财报中位数（营收/EPS 增速、利润率、PE） |
| 经营叙事是否共振？ | CompanyOperatingBrief + IndustryPeerResonance（外部 AI ingest） |

## 数据命令

```bash
npm run db:migrate                 # 含 equity 相关表
npm run equity:seed-sp500          # Wikipedia → equity_security + index_constituent
npm run equity:sync-profiles       # 分日 FMP profile（默认 --limit=40）
npm run equity:sync-fundamentals  # Top-N 财报快照（默认 --limit=100）
npm run equity:sync-sec            # Top-N SEC 8-K/10-Q/10-K 索引
```

`npm run data:apply` 会在 migrate 后尝试 `equity:seed-sp500`（失败不阻断宏观落库；可用 `--skip-equity` 跳过）。

## 计划任务建议

| 频率 | 命令 |
|------|------|
| 每周 | `equity:seed-sp500` |
| 每日 | `equity:sync-profiles -- --only-missing` 与/或增量 limit |
| 每日 | `equity:sync-fundamentals -- --limit=100` |
| 每 6 小时 | `equity:sync-sec -- --limit=50` |

Sector ETF 日线依赖 **IBKR**（与 `/markets` 相同）。FMP 免费档勿一次拉全量 501 profile。

## Ingest（AI）

- `POST /api/equity/company-operating-briefs` — schema 见 `docs/specs/company-operating-brief.schema.json`
- `POST /api/equity/industry-peer-resonances` — schema 见 `docs/specs/industry-peer-resonance.schema.json`
- 鉴权：`EQUITY_INGEST_TOKEN` 或回退 `WEEKLY_REPORT_INGEST_TOKEN`

## 配置代码

- `src/lib/equity/gicsCatalog.ts` — GICS 11 ↔ ETF ↔ FMP normalize
- `src/lib/equity/styleBuckets.ts` — 成长/周期/防御
- `src/lib/equity/sectorMacroMap.ts` — 行业 → 宏观 keys

## Prisma 表

| 表 | Schema |
|----|--------|
| `mds.equity_security` | 证券主数据 |
| `mds.index_constituent` | SP500 成分快照 |
| `mds.equity_fundamental_snapshot` | 财报/估值缓存 |
| `mds.sec_filing` | SEC 披露索引 |
| `public.company_operating_brief` | 经营简报 |
| `public.industry_peer_resonance` | 同业互证 |

调研背景：`docs/research/US_EQUITY_INDUSTRY_RESEARCH.md`、`docs/research/US_EQUITY_OPERATING_TRACK_DECISION.md`。

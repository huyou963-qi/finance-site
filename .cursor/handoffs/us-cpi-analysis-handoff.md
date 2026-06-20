# 交接：finance-site 美国 CPI 分析框架

> 新对话请 `@` 本文件 + `.cursor/prompts/us-cpi-analysis-framework.md`

## 项目

**finance-site** — 美国 CPI 通胀分析框架（宏观页内置模板 + FRED 调度 + 指标目录）

## 权威 Prompt

`.cursor/prompts/us-cpi-analysis-framework.md`

- 含 **§0 指标有效性门禁**：入库/写模板前须验证 FRED 仍有近年观测；停更 ID 须替换或剔除
- 四图模板链条、中文 displayName、metadata、模板介绍 handoff 均在该 Prompt

## 已完成

| 项 | 说明 |
|----|------|
| 4 个四图内置模板 | `layoutMode: 4`，文件夹「美国通胀分析」 |
| 模板 ID | `builtin-us-cpi-level0` / `structure` / `cost-push` / `expectations` |
| CPI metadata 入库 | `seed-cpi.ts` 写入 Instrument `metadata`（国家/单位/来源/显示名等） |
| 已选指标中文名 | `resolveMacroSeriesLabel` + `CPI_VIRTUAL_KEY_LABELS` |
| FRED 属性展示 | `MacroSection` 对 `fred:` 虚拟键拉取 `sched_fred_*` instrument 属性 |
| Prompt §0 | 有效性检查流程、候选清单、verify 要求已写入 Prompt |

## 关键路径

| 用途 | 路径 |
|------|------|
| 四模板布局与介绍 | `src/lib/data/cpiAnalysisLayout.ts` |
| FRED 种子定义 | `src/lib/data/scheduler/cpiFredSeedCatalog.ts` |
| 种子脚本 | `scripts/data-worker/seed-cpi.ts` |
| 验证脚本 | `scripts/data-worker/verify-cpi.ts` |
| 宏观页 | `src/app/macro/MacroSection.tsx` |
| 目录 label | `src/lib/data/fredCatalog.ts` |
| 模板注册 | `src/lib/data/macroPresetTemplates.ts` |
| 分析文档 | `docs/US_CPI_ANALYSIS.md` |
| 调度文档 | `docs/DATA_SCHEDULER_CPI.md` |

## 运维命令

```bash
npm run data:seed-cpi
npm run data:sync-calendar    # 可选
npm run data:worker           # 拉观测
npm run data:verify-cpi -- --db
```

## 约束

- **不要** commit `.env.local` / API Key / Cookie
- 改 Prompt 或种子前：先 `npm run data:verify-cpi -- --db`
- 用户可见 UI：**中文指标名**，不暴露 FRED ID 作主标签

## 下一步（新对话任务）

1. **宏观数据库**：继续完善 `mds` 层 CPI 相关 Instrument / 观测 / 订阅；按 Prompt **§0** 逐条验证 FRED 有效性，替换停更序列
2. **宏观模板**：在现有 CPI 四模板基础上，继续创建/扩展 **分析宏观经济的各类内置模板**（遵循每模板最多 4 图、中文名、模板介绍 handoff）
3. **可选增强**：`verify-cpi.ts` 增加 §0.1 近期观测窗口检查；定稿 FRED 清单写入 `docs/US_CPI_ANALYSIS.md`

## 已知问题 / 背景

- 部分旧 `CUSR0000*` 候选 ID 可能在 FRED 停更 — 须按 §0 验证后定稿
- Investing 日历 Cookie 在 Node 侧可能 403，见 `docs/INVESTING_CALENDAR_COOKIE.md`
- `verify-cpi --db` 已检查 metadata 完整性；**近期 obs 窗口检查 Prompt 要求了但脚本可能尚未完全实现**

## 新对话开场（复制粘贴）

```
项目：finance-site 美国 CPI 分析框架
请先读 @.cursor/handoffs/us-cpi-analysis-handoff.md 和 @.cursor/prompts/us-cpi-analysis-framework.md

下一步：
1. 继续完善宏观数据库（CPI/FRED 按 §0 验证有效性后入库）
2. 继续创建分析宏观经济的各类内置模板

注意：不要提交 .env.local；改 Prompt/种子前先跑 npm run data:verify-cpi -- --db
```

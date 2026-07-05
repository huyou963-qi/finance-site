# 宏观分析维度接入 Spec 模板（美国）

> 每个新分析维度复制本文件为 `docs/specs/us-<dimension>.spec.md`（如 `us-monetary-financial.spec.md`）。
> Spec 是 Agent 流水线的**唯一交接物**：Agent A 产出 §1–§5，人工评审后 Agent B/C 执行 §3，Agent D 执行 §2/§4，Agent E 按 §6 验收。
> 每个阶段完成后**回写本文件**（勾选 §6、更新 §0 状态），Spec 即接入过程的单一事实来源。

---

## §0 元信息

| 字段 | 值 |
|------|----|
| dimension id | `us-<dimension>`（kebab-case，全流程复用此 id） |
| 中文名 | 如「美国货币政策与金融条件」 |
| 内置文件夹 id | `folder-builtin-us-<dimension>` |
| 模板 id 前缀 | `builtin-us-<dimension>-` |
| 分支 | `feature/macro-<dimension>` |
| 状态 | `draft` → `indicators-approved` → `data-ready` → `template-ready` → `verified` |
| 对应框架页维度 | `matrixCategories.ts` 中的 category（如 `financial` + `policy`） |
| 评审记录 | 日期 + 结论（每次人工评审追加一行） |

---

## §1 分析框架

### 1.1 核心问题（L0）

> 一句话：这个维度回答宏观投资中的什么问题？（对标 `docs/US_OVERVIEW_ANALYSIS.md` 的写法）

### 1.2 分析层级

| 层级 | 问题 | 主要指标（显示名） | 落到哪个模板/图 |
|------|------|--------------------|-----------------|
| L0 | | | |
| L1 | | | |
| L2 | | | |

### 1.3 与现有模板的分工（必填）

| 相邻主题 | 归属 | 本维度不做 |
|----------|------|------------|
| 如：CPI 分项 | 美国通胀分析 | 不重复 Headline/Core |

---

## §2 模板规划

沿用「① 总览 + ② 驱动」双模板模式，`layoutMode: 4`（四图槽）。每维度 2–3 个模板。

| 顺序 | 模板 id | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-<dimension>-overview` | | 默认第一步 |
| ② | `builtin-us-<dimension>-drivers` | | 总览说不清时加载 |

### 图槽设计（每模板一张表）

**模板 ①**

| 图 | slotTitle | 序列（显示名） | 轴 | 图型 |
|----|-----------|----------------|----|------|
| 1 | | | left | line |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

---

## §3 指标清单（核心表，每行一个序列）

> 填写前先查 [USED-INDICATORS.md](./USED-INDICATORS.md)：已被其他模板占用的指标**不得复制**，在 §1.3 写「引用现有模板」。

| # | seriesKey | 显示名 | 频率 | 单位 | 发布机构 | 获取方式 kind | 源标识 | 历史回填 | 调度方式 | 模板/图槽 | 计算 | 去重 |
|---|-----------|--------|------|------|----------|---------------|--------|----------|----------|-----------|------|------|
| 1 | `fred:XXXX::yoy` | | 月 | % | BLS | `fred_api` | FRED id | FRED 全量 | 发布包 `us.xxx` | ①-1 | yoy | ✅ 未占用 |

**列定义**：

- **seriesKey**：宏观页 virtualKey。FRED 走 `fred:<ID>[::variant]`；库内序列走 `mds:<instrument_code>`（code 规范 `sched_fred_<ID>` / `<dim>_us_<name>`）。
- **获取方式 kind**（六选一，决定交给 Agent B 还是 Agent C）：

| kind | 含义 | 执行 Agent | 复用 |
|------|------|-----------|------|
| `fred_api` | FRED 官方 API | B | `fredAdapter` + 限频器 |
| `worldbank_api` | 世行 API | B | `worldbankAdapter` |
| `rest_api_existing` | 已接 REST 源（`treasury-fiscal-data` / `cftc-cot` / `estat-jp` / BIS） | B | 对应 adapter |
| `te_scrape` | TradingEconomics 指标页 | C | `te-indicator-scrape.md` 全流程 |
| `web_scrape_new` | 其他网页（官网/机构页），需新解析器 | C | `agent-c-web-scrape-onboarding.md` |
| `bulk_file` / `manual` | 批量文件 / 人工 | B（标注） | `overviewXlsxAdapter` 或 MANUAL |

- **历史回填**：FRED/API 源写「API 全量」；抓取源写历史来源（xlsx / 机构 CSV 下载 / TE 历史表），**抓取源必须先解决历史，再谈增量**。
- **调度方式**（写入 `releaseRule`）：
  - 有官方发布日 → 发布包 id + 日历关键词（`releasePackageCatalog.ts`；关键词 + excludes 都要写）；
  - 日频/交易日 → `probe_interval`（写 intervalHours，如 24）；
  - 抓取源 → 日历（若 TE 日历有事件）或 `probe_interval` 兜底。
- **计算**：`none | yoy | pctChange | diff | cumsum`；日频进月频图需注明 `resampleToMonth + avg`。DB 只存水平值，变换在前端 `seriesCalcConfigMap` 做。

### 3.1 需要新数据源的指标（Agent C 输入）

每个 `te_scrape` / `web_scrape_new` 指标补一段调研记录：

| 字段 | 内容 |
|------|------|
| 目标 URL | |
| 页面类型 | TE 指标页 / 官方统计页 / JSON 接口 / CSV 下载 |
| 数据在页面哪里 | 表格 selector / JSON path / 文本位置（截图或 HTML 片段） |
| 历史数据入口 | 页面历史表 / 下载链接 / 需 xlsx 人工导入 |
| 合规检查 | robots.txt 结论、条款要点、请求频率上限、是否需 Cookie/UA |
| 发布规律 | 每月第 N 个工作日 HH:MM ET 等 |
| fixture 路径 | `.data/<provider>-sample.html`（Agent C 落库前必存） |

---

## §4 图表介绍与分析方法（Agent D 的文案输入）

### 4.1 模板 description（每模板一句话）

### 4.2 chartIntroNotes 草稿（按图 1–4 写分析顺序，不逐指标展开）

**模板 ①**

1. 图 1：看什么 → 什么信号 → 跳到哪张图
2. 图 2：…
3. 图 3：…
4. 图 4：…

### 4.3 决策树（观察 → 对照图位 → 典型结论）

| 观察 | 对照图位 | 典型结论 |
|------|----------|----------|
| | | |

---

## §5 交付物清单（按维度定制文件名）

| 交付物 | 路径 | 执行 Agent |
|--------|------|-----------|
| seed catalog | `src/lib/data/scheduler/<dim>FredSeedCatalog.ts`（API 源） | B |
| 抓取模块 | `src/lib/data/scheduler/<provider>/` + `adapters/<provider>Adapter.ts`（如有） | C |
| seed / verify 脚本 | `scripts/data-worker/seed-<dim>.ts` / `verify-<dim>.ts` + `seedCatalogRegistry.ts` 注册 + package.json | B/C |
| 发布包 | `releasePackageCatalog.ts` 新增成员 | B/C |
| 模板 layout | `src/lib/data/<dim>AnalysisLayout.ts` | D |
| 模板注册 | `macroPresetTemplates.ts`（文件夹 + id 映射） | D |
| 分析文档 | `docs/US_<DIM>_ANALYSIS.md` | D |
| 框架 prompt | `.cursor/prompts/us-<dim>-analysis-framework.md` | D |
| 负面清单更新 | `docs/specs/USED-INDICATORS.md` 追加本维度指标 | E |

---

## §6 验收清单（Agent E 按此出报告）

**数据（Agent B/C 完成后）**

- [ ] 全部指标 `Instrument` 入库，历史观测条数 ≥ 预期（逐条列出 code + 首末观测日期）
- [ ] `data:verify -- --catalog=<dim> -- --db` 通过
- [ ] `/admin/data-catalog`：库内来源 / 数据源链接 / 获取方式三列齐全，状态为「等待下次更新」（非「不可自动更新」/「日历未匹配」）
- [ ] 抓取源：fixture 测试通过 + live 抓取成功各一次
- [ ] `data:sync-calendar` 后发布包 matched，`nextRunAt` 有值

**模板（Agent D 完成后）**

- [ ] `npm run build` + `npm run lint` 通过
- [ ] 宏观页加载新模板：四图渲染、轴/单位正确、日频序列月均对齐
- [ ] 模板介绍 Tab 显示 description + chartIntroNotes
- [ ] 指标与现有全部模板零重复（对照 USED-INDICATORS.md）
- [ ] docs / layout / prompt 三处指标清单一致
- [ ] 未改动任何现有模板 id、migration、`MacroSection.tsx` 结构

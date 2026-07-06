# Agent C — 网页抓取接入（web-scrape-onboarding）

> 输入：Spec §3 中 kind ∈ {`te_scrape`, `web_scrape_new`} 的指标 + §3.1 调研记录。
> 职责：**分析网页结构 → 固化为可复用的抓取模板（parser + adapter + metadata.scrape 配置）→ 历史回填 → 挂到调度**，让 `data:worker` 在更新日自动抓取。
> 这是一个可重复执行的 skill：每接一个新页面都走同一流程，产物沉淀为 `<provider>` 模块。

## 三档抓取方案（先分类，再动手）

| 档 | 适用 | 实现 | 蓝本 |
|----|------|------|------|
| **C1 通用单值** | 页面/JSON 接口只需取 1 个最新值，无历史表 | **零代码**：`Instrument.metadata.scrape` 配 `url + jsonPath/selector`，走现有 `adapters/webScrapeAdapter.ts` | `webScrapeAdapter.ts` |
| **C2 TE 指标页** | TradingEconomics 指标页（headline + components + 日历） | 按既有 TE 流程做 catalog + parser + adapter | [te-indicator-scrape.md](./te-indicator-scrape.md)（ISM 范本，**全文必读**） |
| **C3 新站点结构化页** | 官方机构页（ISM.org、NY Fed、Census 发布页…）含历史表/CSV | 新建 `<provider>/` 模块：client + parser + adapter + seed/sync 脚本 | 模仿 `tradingEconomicsIndicator/` 目录结构 |

判断顺序：能 C1 不做 C3；页面若有隐藏 JSON/CSV 接口（看 Network 面板/页内 `<script>` 数据），优先当 C1/结构化接口处理，比解析 HTML 稳定。

## 通用流程（C2/C3；C1 只做 1、2、6、7、8）

### 1. 合规检查（必做，结论写进 Spec §3.1）

- `GET <origin>/robots.txt`：目标路径是否 Disallow；
- 页面条款是否禁止自动抓取；抓取频率是否 ≤ 数据发布频率（月频指标每天最多 probe 一次，发布日按日历精确触发）；
- 需要 Cookie/UA 的（如 TE）用 `.env.local` 变量（`TE_CALENDAR_COOKIE` 模式），**不写进代码**。
- 不可抓（明确禁止/需登录付费）→ 停下，把指标改报 `manual` 或换源，回 Agent A。

### 2. 抓取存档 fixture

用与生产相同的请求头抓 HTML/JSON，存 `.data/<provider>-sample.html`。**后续 parser 开发全部离线跑 fixture，禁止边开发边打真站。**

### 3. 页面结构分析（固化为「抓取模板」）

产出一张结构清单写入 parser 文件头注释 + Spec §3.1：

| 项 | 要确认的 |
|----|----------|
| 最新值 | 所在元素/JSON path；数值清洗规则（%、逗号、括号负数） |
| 观测期 | reference 文本 → `obsDate` 的推导规则（如 "JUN 2026" → 2026-06-01） |
| 历史表 | 是否有多行历史；只有最新值 → 历史回填走 xlsx/CSV（见步骤 6） |
| 多指标映射 | 页面行文本 ↔ `instrumentCode` 映射表（写成 `<provider>Catalog.ts`，参考 `ismCatalog.ts`） |
| 下次发布 | 页内日历/发布日程如何取（辅助校验，不替代 TE 日历） |
| 脆弱点 | 依赖的 DOM 结构/字段名，变更时 parser 应**报错而不是静默取错值** |

### 4. parser + 单测

`src/lib/data/scheduler/<provider>/parse<Dataset>Page.ts`：

- 纯函数：HTML/JSON 文本 → `{ points: ObservationPoint[], sourceLatestObsDate }`；
- **防御性断言**：找不到锚点元素、数值解析失败、observation 日期异常（未来日期/倒退）→ throw，让 fetch_run 记 FAILED 触发告警，绝不写入可疑值；
- fixture 测试先通过，再 live 试一次。

### 5. adapter + 注册

- `adapters/<provider>Adapter.ts`：实现 `fetch<Provider>Incremental(metadata, instrumentCode, obsStart)`；整页多指标共用时**缓存页面 60s**（同一轮 worker 只打一次源站，参考 ISM adapter）。
- 在 `fetchSubscriptionIncremental.ts` 的 `REST_API` 分支按 `metadata.scrape.provider === "<provider>"` 分发（**只加分支，不改既有分支**）。
- 命名约定：`scrape.provider` 小写下划线；`DataSource.id` = `<provider>` kebab；npm 脚本 `data:seed-<dataset>` / `data:sync-<dataset>`。

### 6. 历史回填

抓取源通常只有最新值/短历史，三选一（Spec §3 已定）：

1. 页面自带历史表 → parser 全量解析一次性入库；
2. 机构官方 CSV/Excel 下载 → 参考 `db:import-macro-xlsx` 流程导入；
3. FRED 有停更镜像/相近序列 → FRED 回填历史 + 抓取续新（在 metadata 注明拼接点）。

### 7. metadata 三件套（管理页三列的来源）

seed 脚本为每条仪器写入（字段规范见 te-indicator-scrape.md 第三部分）：

```json
"source": "...", "officialUrl": "...",
"fetchAcquisition": { "status": "known", "method": "<provider>_scrape",
  "methodLabel": "scripts/data-worker/sync-<dataset>.ts", "fetchUrl": "..." },
"scrape": { "provider": "<provider>", "url": "...", "component": "...", "script": "..." }
```

门禁：`fetchAcquisition.status === "known"` 且非 `bootstrapOnly` 才参与 worker 调度。

### 8. 更新调度（"到了更新日期自动去获取"）

- **有官方发布日**（月频指标）→ 发布包 + TE 经济日历：`releasePackageCatalog.ts` 加包（keywords/excludes 来自 Spec），`data:sync-calendar` 对齐 `nextRunAt`，发布时刻 +3 分钟自动抓；多分项共用 headline 一条日历事件（**禁止**每分项单配关键词）。
- **无日历事件** → `releaseRule: { type: "probe_interval", intervalHours: N }` 定期探测；页面无新值时 adapter 返回空 points，状态显示「源端暂无新值」。
- 抓取失败 → fetch_run FAILED + 滞后告警（`lagAlerts.ts` / Slack 通道已有）；连续失败优先怀疑页面结构变更，回到步骤 2 重新取样比对。

## 验证 checklist（并入 Spec §6）

- [ ] fixture 解析输出样例（headline + 1 分项）与页面人工核对一致
- [ ] live 抓取一次成功、重复跑幂等（upsert 不产生重复观测）
- [ ] 历史回填后首末观测日期符合预期
- [ ] `data:sync-calendar` matched（或 probe_interval 生效），`/admin/data-catalog` 状态「等待下次更新」
- [ ] parser 对"锚点缺失"的 fixture 变体会 throw（手工删掉锚点测一次）
- [ ] `.data/` fixture 已留存；新增 npm scripts 已写入 AGENTS.md 一行引用

## 硬约束

- 禁止使用付费 API Key 写入仓库；禁止跳过 fixture 直接写 parser；禁止未 `known` 就参与调度（与 TE 流程三禁令一致）。
- 请求必须带超时（30s）与限频（`DataSource.rateLimit.minIntervalMs`）；不重试风暴（backoff 由 `releaseRule.computeBackoffRunAt` 处理）。
- 静默错值是最高级事故：宁可 FAILED 告警，不可写入解析不确定的数值。

## 已跑通范例：NY Fed 衰退概率（C3 · Excel 抓取，2026-07）

首个真实 C3 案例，可直接照抄。模块 `src/lib/data/scheduler/nyFedRecession/`（client + parseRecProb + catalog）+ `adapters/nyFedRecessionAdapter.ts` + seed/sync/verify-nyfed-recession + `fetchSubscriptionIncremental.ts` 加 `scrape.provider === "nyfed_recession"` 分支。

- **源是 Excel 不是 HTML**：官方 `allmonth.xls`（OLE/BIFF），用项目已有的 `xlsx` 库 `XLSX.read(buf,{type:"buffer"})` + `sheet_to_json`。`.xlsx` 后缀不一定是 Excel（NY Fed 的 `Prob_Rec.xlsx` 实为 PDF），**务必看文件头字节**（`D0CF11E0`=OLE / `504B`=xlsx / `%PDF`=PDF）。
- **Excel 日期用 `XLSX.SSF.parse_date_code(serial)`** 确定性转 {y,m,d}，避开 cellDates 的时区偏移；月频归一到月首 `Date.UTC(y,m-1,1)` 与库内对齐。
- **单位归一在 parser**：源为分数（0.15），×100 存百分比、unit `%`（这是单位规整非分析变换，可在 parser 做）。
- **防御**：sheet/列缺失、0 有效点、值越界一律 throw（源改版报错而非静默）。
- **坑（已修）**：`sync-one.ts` 原 include 未 select `instrument.metadata`，导致抓取型 provider 被误路由到 BIS 兜底。已修（select metadata + releasePackage）。**测抓取型 provider 的 worker 分发，别只信 sync 脚本直调 parser——要走 `sync-one` 或 worker 验证 `fetchSubscriptionIncremental` 分发命中。**
- **非 FRED 判定**：FRED 的 `RECPROUSM156N` 是 Chauvet-Piger 方法，≠ NY Fed 收益率曲线模型，故 NY Fed 版是真抓取目标。接入前务必确认目标确实不在 FRED/已接 API 源。

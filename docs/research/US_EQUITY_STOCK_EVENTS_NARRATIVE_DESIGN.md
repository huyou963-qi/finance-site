# 个股「事件与叙事」设计（Phase 3 · P10 详细方案）

> 日期：2026-07-13
> 依据：[US_EQUITY_STOCK_DRILLDOWN_DESIGN.md](./US_EQUITY_STOCK_DRILLDOWN_DESIGN.md) §3 P10、§6 Guardrails
> 状态：设计稿，待批准

---

## 1. 现状盘点（2026-07-13 实查）

| 资产 | 状态 | 说明 |
|---|---|---|
| `mds.sec_filing` 表 | **空**（0 行） | 表结构与索引已建好（cik/symbol/accession/form/filedAt/url） |
| `scripts/equity/sync-sec.ts` | 已有，从未运行 | SEC submissions → 8-K/10-Q/10-K 增量入库，**未采集 8-K items 编码** |
| `company_operating_brief` 表 | **空**（0 行） | 外部 AI Automation ingest 的落地表；API `/api/equity/company-operating-briefs?symbol=` 已支持按 symbol 过滤 |
| `industry_peer_resonance` 表 | **空**（0 行） | 同上，行业互证叙事 |
| `mds.equity_split` | 有数据 | 价格管线落的拆股事件（exDate/ratio） |
| `mds.equity_fundamental_snapshot` (Q) | 501/503 × 20 季 | 每季 fiscalDate + 营收/EPS/YoY 齐备，可直接充当「业绩事件」内容源 |
| 个股页 | 占位区块 | 「事件与叙事（Phase 3 交付）」虚线框 |

**设计稿原假设「数据已在库」不成立**——filings 与 briefs 都需要先把数据跑起来。

---

## 2. 目标与信息架构

回答分析师三个问题：**这家公司最近发生了什么（事件流）→ 管理层/叙事怎么说（briefs）→ 市场怎么反应（价格联动）**。

统一事件模型（读取时聚合，不建新表）：

```ts
type StockEvent = {
  date: string;                        // 事件日（filing 为 filedAt，拆股为 exDate）
  type: "earnings" | "8k" | "annual" | "split";
  title: string;                       // 「FY2026 Q2 财报（10-Q）」「8-K：业绩发布」「拆股 10:1」
  subtitle?: string;                   // 8-K items 中文标签串；业绩事件为「营收 81.6B (+85%) · EPS 2.39」
  url?: string;                        // SEC 原文（primary document 优先，index 兜底）
  metrics?: { revenue; revenueYoY; eps; epsYoY; period };  // 仅 earnings/annual，来自基本面库
};
```

三个数据源在 API 层合并：
1. **sec_filing**：10-Q/10-K → earnings/annual 事件（与 `equity_fundamental_snapshot` 按 fiscalDate 就近关联，把当季营收/EPS/YoY 内嵌进事件行——不用再打 SEC）；8-K → 公司事件，按 items 编码分类。
2. **equity_split**：拆股事件。
3. **company_operating_brief**：叙事卡（独立区块，不进时间线）。

8-K items → 中文标签映射（重要性分级）：

| items | 标签 | 级别 |
|---|---|---|
| 2.02 | 业绩发布 | 高 |
| 1.01 / 1.02 | 重大协议签订/终止 | 高 |
| 5.02 | 董事/高管变动 | 高 |
| 2.01 | 收购/资产处置完成 | 高 |
| 2.05 / 2.06 | 重组/减值 | 高 |
| 5.07 | 股东大会结果 | 中 |
| 7.01 / 8.01 | 监管披露/其他公告 | 低 |
| 9.01 | 附件（伴随项，不单独展示） | — |

---

## 3. 分阶段实施

### Phase A：filings 时间线 MVP（数据 → API → UI）

**A1. 迁移**（additive）：`sec_filing` 加 3 列
- `items VarChar(64)`（8-K 的 "2.02,9.01" 原样存）
- `primary_document VarChar(256)`、`primary_doc_description VarChar(256)`（直链文档）

**A2. 增强 `sync-sec.ts`**：
- submissions JSON 的 `recent` 里逐条采集 `items` / `primaryDocument` / `primaryDocDescription`；
- URL 生成优先 `…/{accessionNoDash}/{primaryDocument}`；
- 支持 `--symbols=`（对齐 sync-fundamentals 的参数习惯）；
- 全量跑一次 `--limit=503 --days=750`（约 500 请求 ≈ 3 分钟，SEC 限速内）。

**A3. API `/api/equity/stocks/[symbol]/events`**：
- 查三源 → 归并排序（倒序）→ `?types=&limit=`；
- 10-Q/10-K 关联基本面：`fiscalDate ∈ [filedAt−100d, filedAt]` 取最近一季快照嵌 metrics；
- **懒回补**：库内该 symbol 无 filing 时现场拉一次 submissions（同基本面懒回补模式，脚本仍是主路径）。

**A4. UI `StockEventsPanel`**（替换占位区块）：
- 时间线列表：按月分组；类型 badge（业绩=蓝 / 年报=深蓝 / 8-K 高=琥珀 / 8-K 低=灰 / 拆股=紫）；业绩行内嵌 metrics；点击外链 SEC；
- 过滤器：类型多选 + 「仅重大」开关（隐藏低级别 8-K）；
- 叙事卡区：`/api/equity/company-operating-briefs?symbol=` 渲染 bodyMarkdown，空态文案「经营叙事由外部 ingest 提供，尚未接入」。

**A5. 验证锚点**：AAPL（季度节奏规整）、TSLA（8-K 高频）、JPM（8-K 监管披露多）；核对最近一次财报事件的日期/链接/metrics 与 EDGAR 原文一致。

涉及文件：migration + `schema.prisma`、`scripts/equity/sync-sec.ts`、新 `src/lib/equity/stockEvents.ts`（聚合纯函数+懒回补）、新 route `events/route.ts`、新 `src/components/equity/StockEventsPanel.tsx`、`StockDetailClient.tsx` 挂载。难度：中。

### Phase B：价格联动（Bloomberg 风格）

- `StockPriceChart` 加 ECharts `markPoint`：earnings 事件打点在 K 线上，hover 显示「FY Q · 营收 YoY · EPS」；
- 业绩事件行加「T+1 反应」列：财报披露次交易日涨跌幅（价格库现算，不落库）；
- 事件时间线 hover ↔ K 线打点高亮联动（可选）。

涉及：`StockPriceChart.tsx`、events API 加 `reaction` 字段。难度：低-中。

### Phase C：叙事接入与可选扩展

- **C1（默认）**：briefs/peer-resonance 外部 Automation ingest 恢复供数后自然点亮（表结构即接口，无代码变更）；个股叙事卡 + 行业互证链接。
- **C2（可选，需单独批准）**：站内轻量提取管道——8-K item 2.02 的 EX-99.1 业绩新闻稿抓 highlights 段做要点卡。**注意：违反 Guardrail #8（不为个股新增 AI 生成管道）**，故默认不做，仅在 ingest 长期缺位时作为替代提案。

### 运维

- `equity:sync-sec` 与 `equity:sync-fundamentals --period-type=Q` 并入同一份财报季周跑清单；
- 懒回补兜底保证冷门股首次访问即有数据。

---

## 4. 范围外的三类功能（分析、取舍、未来路线）

本阶段**不做**以下三项，原因均不是技术障碍，而是数据源、成本、架构纪律的取舍。逐条说明能不能做、做的收益、以及真做的代价。

### 4.1 盘中新闻流 / 第三方新闻源

**现状**：本项目所有数据源都免费且无许可负担（SEC EDGAR、Yahoo）。新闻是不同类别——没有"免费且可再分发"的权威源。

| 维度 | 说明 |
|---|---|
| **能做吗** | 能，但档位不同；免费层都有代价 |
| **低成本** | 直接用 8-K（公司官方披露），不涉及第三方版权 |
| **中成本** | 接 Finnhub/Marketaux/Yahoo quoteSummary 免费 API——但①免费层限流严（几十次/分钟），覆盖 500 只需排队；②**版权**——新闻摘要是媒体作品，缓存+展示属再分发，免费 ToS 通常禁止 |
| **高成本** | Bloomberg/路透/道琼斯新闻 feed，年费 5–7 位数美金，且合同限展示方式 |
| **做的好处** | 填补财报间隙（季度频率 → 日频事件流），这是 Bloomberg 终端最值钱部分之一——市场每天对新闻定价 |
| **我的建议** | **只做 8-K 官方披露（完全合规免费），不做第三方新闻**。8-K 已覆盖最有分析价值的子集（重大事件官方版本），第三方新闻的增量主要是"媒体解读和小道消息"，恰恰是版权和噪音最重的 |

### 4.2 Earnings call transcript（财报电话会纪要）

**现状**：没有免费权威源。SEC 不强制上市公司提交，EDGAR 上无。系统性获取只能靠付费。

| 维度 | 说明 |
|---|---|
| **能做吗** | 需付费。少数公司 8-K 附 EX-99.2 讲稿，但不规律不全 |
| **付费源** | FMP 付费档、AlphaVantage、Seeking Alpha、Motley Fool API，年费 $300–$5k |
| **做的好处** | **质的补充**。三张表 = 过去发生了什么；电话会 = 管理层怎么解释、下季指引、分析师在追什么。前瞻性信息（guidance）几乎只在电话会。买方研究员读财报 1 小时、读+听电话会 3 小时，信息密度完全不同。配合已有 AI 摘要能力，这是最佳素材 |
| **我的建议** | **最值得未来投入的一条**。价值极高，卡在数据可得性。一旦接入付费源，配合 AI 摘要做成独立 ingest 任务（不进请求路径），性价比很高。优先于其他付费源 |

### 4.3 站内 AI 生成管道（8-K 新闻稿摘要等）

**现状**：与前两条不同，这是**架构纪律**，继承自现有 guardrail——"不为个股新增 AI 生成管道，只消费已有 ingest"。

| 维度 | 说明 |
|---|---|
| **能做吗** | 完全能。技术栈现成，C2 提案的"抓 8-K EX-99.1 → LLM 提取 3-5 要点"一两天落地 |
| **好处** | 把"一堆原始 filing"变成"一句话讲清财报关键"。不想读原文的用户体验巨大跃升。Bloomberg 近年主推 AI 摘要方向 |
| **代价** | ①**幻觉**——金融数字错一位就是事故，生成要点必须能回链原文校对；②**成本**——500 只 × 每季 × 多份 8-K，token 累积可观；③**维护负担**——prompt/模型版本/失败重试都成主站长期包袱 |
| **架构问题** | 如果每个功能都自建"原文→LLM→结果"管道，散落很多难维护、会烧钱、质量不稳定的旁路。项目现在采用"生成在外（ingest）、消费在内"模式，目标是解耦 |
| **我的建议** | **保持"生成在外、消费在内"的边界**。要做站内 AI 摘要，做成**独立 ingest 任务**（定时脚本），结果落到 `company_operating_brief` 表，而不是进请求路径。这样架构一致，不阻塞主站，也能在 token 成本或效果不理想时轻松换模型或停用 |

---

## 5. 未来选项与演进路线

### 付费数据源的投入顺序

1. **电话会纪要**（优先级：高 ⭐⭐⭐）
   - 年费 $300–$5k
   - 收益：获得 guidance/分析师互动，补全前瞻性信息
   - 实施：接 API → ingest 任务 → 落 `company_operating_brief` 表（同 briefs 一体）+ AI 摘要为可选项
   
2. **实时新闻 feed**（优先级：中 ⭐⭐）
   - 年费 $2k–$50k（档位差很大）
   - 收益：填补财报间隙，但增量有限（市场已定价）
   - 风险：版权和 ToS 合规要仔细读
   
3. **分析师一致预期**（优先级：低 ⭐）
   - 年费 $10k+
   - 收益：前瞻估值，但受自己的拆股/口径影响大，边际收益递减
   - 缺点：数据滞后、变动频繁，落库容易过期

### 站内生成管道的演进

如果将来要扩展 AI 能力（电话会摘要、8-K 要点、行业舆情互证等），遵循这个模式：
- **都作为独立 ingest 任务**（可在 `scripts/equity/`、`scripts/macro/` 下）
- **结果统一落到持久表**（`company_operating_brief`、`industry_peer_resonance` 等）
- **主站只读消费**，避免请求路径依赖 LLM 调用

这样即使模型/prompt/token 成本调整，也不会阻塞用户页面。

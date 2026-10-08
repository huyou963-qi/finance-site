# 美国财政分析框架

本文档与宏观页内置模板、`fiscalAnalysisLayout.ts`、`.cursor/prompts/us-fiscal-analysis-framework.md` 保持一致。

## 初学者阅读顺序

1. 概念：联邦 vs 州/地方、流量 vs 存量、FY 财年（10/1–9/30）、现金 MTS/DTS vs 权责 NIPA  
2. **模板 ① 财政总览** → 写 L0（≤150 字）  
3. 若问「为什么赤字变」→ **模板 ② 财政结构**  
4. 发布月 / 周频 → **模板 ③ 高频跟踪**  
5. 用框架 §1.4 **五问**自检  

## 三模板链条（宏观页 → 美国财政分析）

内置 **3 个** 模板（`layoutMode` 随图位数：4 / 4 / 5），文件夹 `folder-builtin-us-fiscal`。

| 顺序 | 模板 ID | 名称 | 何时加载 |
|------|---------|------|----------|
| ① | `builtin-us-fiscal-overview` | 财政总览 · 存量与流量 | **默认第一步** |
| ② | `builtin-us-fiscal-structure` | 财政结构 · 收支拆解 | 需解释收入/支出/刚性 |
| ③ | `builtin-us-fiscal-highfreq` | 高频跟踪 · 现金流与融资 | MTS 发布月、TGA/DTS/发债周 |

### 模板 ① — 财政总览 · 存量与流量（4 图）

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | 债务存量 | Debt to the Penny 日度公共债务总额、公众持有债务 |
| 2 | 当期缺口 | MTS 月度财年累计赤字 |
| 3 | 收支两端 | MTS 月度财年累计收入、支出 |
| 4 | 利息压力 | MTS 月度净利息支出、月赤字 |

**口径**：日度债务为美元面值，MTS 为现金制；FYTD 每年 10 月重置。旧年度赤字/GDP 与季度债务/GDP 因发布日期较慢，从总览主图移出。不能把月度现金赤字直接称为年度赤字/GDP，也不能将日度债务除以滞后季度 GDP 得到实时债务率。模板 ③继续提供更细的 DTS/TGA 与周度融资。

### 模板 ② — 财政结构 · 收支拆解（4 图）

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | F3b 收入分项 | 个税、企税、payroll（MTS Table 9 堆叠） |
| 2 | F4b 支出结构 | mandatory 代理、discretionary 代理、净利息（**≠ CBO 法定口径**） |
| 3 | F3a/F4a | MTS 总收/总支 YoY |
| 4 | F4c 经济含义 | 政府消费 YoY（GCEC1）、联邦消费+总投资 YoY |

### 模板 ③ — 高频跟踪 · 现金流与融资（5 图）

| 图 | slotTitle | 序列 |
|----|-----------|------|
| 1 | F5a | MTS 月赤字（柱） |
| 2 | F5a | MTS 月收入 vs 支出（水平） |
| 3 | F5b | TGA 日余额 |
| 4 | F5b | DTS 日净现金流 |
| 5 | F5c | 公共债务周净增发 |

**DTS 日净流** = Total TGA Deposits − Total TGA Withdrawals（百万美元），非 BEA 权责赤字。

## 与 Overview 分工

Overview 模板 ② 图 4（L2G）仍使用年度赤字/GDP 与政府消费 YoY 作慢频结构参照；最新财政现金流见本文件夹模板 ①，细分与日度跟踪见模板 ②、③。

## 数据与运维

```bash
npm run data:seed-fiscal
npm run data:verify-fiscal -- --db
```

| 模块 | 路径 |
|------|------|
| 布局与模板 | `src/lib/data/fiscalAnalysisLayout.ts` |
| 角色注册 | `src/lib/data/fiscalSourceRegistry.ts` |
| Treasury 种子 | `src/lib/data/scheduler/treasuryFiscalSeedCatalog.ts` |
| FRED/复合种子 | `fiscalFredSeedCatalog.ts`、`fiscalCompositeFred.ts` |

## 指标去重规则

- 日度债务存量、MTS 财年累计赤字/收支在模板 ① 作为当期入口
- 分项收/支、mandatory/discretionary 代理 **仅** 在模板 ②  
- 模板 ① 月赤字与净利息仅供总览；TGA、DTS、周净发债在模板 ③ 作深入跟踪
- `us-mts-receipts` / `us-mts-outlays`：② 为 YoY，③ 为水平 — 同一 roleId、不同模板 calc  

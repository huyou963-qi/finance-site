# Prompt：美国经济 Overview 分析框架 — 多源入库、指标树、调度与宏观模板

---

## 任务目标

以 **美国宏观分析师** 视角，设计并落地一套 **纯经济基本面** 的 Overview 框架：回答「增长、需求结构、就业、通胀、政策传导」处在什么状态——**不** 覆盖股市、波动率、商品交易、流动性交易或估值比率。

1. **分析方法论（§1）**：按 **GDP 支出法 + 五条支柱** 独立设计；不以 `US_Overview.xlsx` 列顺序为主轴。
2. **多源数据（§0）**：设计阶段 **不** 局限于现有 DB/FRED；角色先定稿，再映射 FRED / BEA API / Census / MDS / 第三方；无源 → **TBD**（§3.4）。
3. **指标有效性**：写入调度/默认模板前逐条验证；**TBD 不调度、不画空壳线**。
4. **宏观模板**：内置 **2 个** 四图模板；**16 个经济角色在双模板间零重复**（每个 `roleId` 仅出现在一个模板）。

**禁止**因缺序列而 **删减 §1 分析块**；**禁止**把 SPX/VIX/WTI/Net Liquidity 等纳入本框架。

---

## 第〇部分：多源有效性门禁

（与前一版相同：§0.1–0.4 有效性定义、探测顺序、数据源优先级 P1–P6。）

```bash
npm run data:seed-overview
npm run data:verify-overview -- --db
npm run data:probe-sources -- --scope=overview
```

---

## 第一部分：分析框架（宏观分析师独立设计）

### 1.1 核心问题

> **美国经济处于扩张、放缓、还是衰退风险上升？**  
> 内需 **C+I+G** 与 **净出口** 谁拉动/拖累？通胀是否偏离 2%？劳动力是否偏紧？政策对实体是支撑还是制约？

### 1.2 五条支柱 + L2 支出法四象限

| 支柱 | 回答什么 | 子块 | 必备指标（displayName） |
| --- | --- | --- | --- |
| **L1 产出与周期** | 总量增长动能 | — | 实际 GDP 环比折年率；工业生产 YoY |
| **L2 国内需求与外部** | **支出法** 结构 + 调查 | **L2C 消费** | 实际 PCE YoY；零售销售 YoY |
| | | **L2I 投资** | 实际私人固定投资 YoY；新屋开工（住房投资代理） |
| | | **L2G 政府** | 联邦赤字/GDP %；实际政府消费支出 YoY |
| | | **L2X 外部** | 实际出口 YoY；实际进口 YoY |
| | | **L2S 调查**（可选） | ISM 制造业 PMI；ISM 非制造业 PMI |
| **L3 劳动力** | 就业松紧 | — | 失业率；新增非农就业（PAYEMS 差分） |
| **L4 价格与目标** | 相对 2% | — | CPI YoY；核心 PCE YoY |
| **L5 政策与传导** | 货币政策对实体 | — | 联邦基金目标利率；10Y-2Y 利差 |

**L0 合成（文字）**：综合 L1–L5 + L2 四象限，判断「扩张 / 放缓 / 停滞 / 衰退风险」+ 1–2 条主因（如「消费稳、投资弱、财政收紧、净出口拖累」）。

**与旧版差异**：L2 不再只有「消费 + ISM」；**投资、政府收支、进出口** 进入默认模板 ②；**ISM 改目录自选**（L2S，数据已 OK，不占默认四图槽位）。

### 1.3  deliberately 排除

（股指、VIX、WTI、Net Liq、CPI 分项等 — 同前版。）

### 1.4 六问决策树（模板 ① 介绍）

| 问 | 看哪里 | 异常时 |
| --- | --- | --- |
| ① 总量走弱？ | L1 图 1 | 加载模板 ② 看 C/I/G/X 谁拖累 |
| ② 消费 vs 投资？ | ② 图 1 vs 图 2 | 消费稳、投资弱 → 周期晚段；双弱 → 内需收缩 |
| ③ 财政与贸易？ | ② 图 3–4 | 赤字扩大 + 进口强 → 外需/财政混合叙事 |
| ④ 就业？ | ① 图 2 | 工资粘性 → CPI/就业模板 |
| ⑤ 通胀锚？ | ① 图 3 | 结构 → CPI 模板 |
| ⑥ 政策与曲线？ | ① 图 4 | 倒挂 + L1 弱 → 衰退概率 |

**80% 场景**：模板 ① 四图写 Overview 段落；需 **支出法拆分** → 模板 ②；需 **ISM 调查** → 目录勾选 L2S 或景气自选。

### 1.5 变动率规则

| 序列 | calc |
| --- | --- |
| GDP SAAR、联邦赤字/GDP | `none`（季频 keep） |
| PCE/零售/投资/出口/进口/政府消费 指数 | `yoy` |
| PAYEMS | `diff` → 非农增量 |
| UNRATE、Fed 目标、10Y-2Y | `none`（日频序列模板内 `resampleToMonth: avg`） |
| HOUST | `none`（水平，月频） |
| ISM PMI | `none` |

### 1.6 两模板链条（**零重复**）

```
模板 ① 经济 Overview · 总量与政策（必看）
    图1  L1   GDP SAAR + 工业生产 YoY
    图2  L3   失业率 + 新增非农
    图3  L4   CPI YoY + 核心 PCE YoY
    图4  L5   联邦基金目标 + 10Y-2Y

模板 ② 经济 Overview · 支出法结构（按需）
    图1  L2C  实际 PCE YoY + 零售 YoY
    图2  L2I  实际私人固定投资 YoY + 新屋开工
    图3  L2X  实际出口 YoY + 实际进口 YoY
    图4  L2G  联邦赤字/GDP % + 实际政府消费 YoY

    （L2S ISM 制造/非制造 → 目录自选，不占上述 8 槽）
```

**跨模板约束**：`us-gdp-saar`、`us-indpro-yoy`、`us-unrate` 等 **仅** 出现在 ① 或 ② 之一（上表已分配，禁止复用）。

---

## 第二部分：与本仓库代码的关系

| 模块 | 路径 |
| --- | --- |
| 布局 + 模板 | `overviewAnalysisLayout.ts` |
| 角色台账 | `overviewSourceRegistry.ts` |
| FRED 种子 | `overviewFredSeedCatalog.ts` |
| 文档 | `docs/US_OVERVIEW_ANALYSIS.md` |

---

## 第三部分：经济指标台账

### 3.1 角色清单（框架必备 + 自选）

| 经济角色 ID | displayName | 支柱 | 首选 FRED / 源 | 默认模板 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `us-gdp-saar` | 实际 GDP 环比折年率 | L1 | `A191RL1Q225SBEA` | ① 图1 | **OK** |
| `us-indpro-yoy` | 工业生产 YoY | L1 | `INDPRO`→yoy | ① 图1 | **OK** |
| `us-unrate` | 失业率 | L3 | `UNRATE` | ① 图2 | **OK** |
| `us-nfp-change` | 新增非农就业 | L3 | `PAYEMS`→diff | ① 图2 | **OK** |
| `us-cpi-yoy` | CPI 同比 | L4 | `CPIAUCSL`→yoy | ① 图3 | **OK** |
| `us-core-pce-yoy` | 核心 PCE 同比 | L4 | `PCEPILFE`→yoy | ① 图3 | **OK** |
| `us-fed-target` | 联邦基金目标利率 | L5 | `DFEDTARU` | ① 图4 | **OK** |
| `us-10y2y` | 10Y-2Y 利差 | L5 | `T10Y2Y`→月均 | ① 图4 | **OK** |
| `us-pce-real-yoy` | 实际个人消费支出 YoY | L2C | `PCEC96`→yoy | ② 图1 | **OK** |
| `us-retail-yoy` | 零售销售 YoY | L2C | `RSAFS`→yoy | ② 图1 | **OK** |
| `us-pfi-real-yoy` | 实际私人固定投资 YoY | L2I | `PNFIC1`→yoy | ② 图2 | **OK**¹ |
| `us-houst` | 新屋开工 | L2I | `HOUST` | ② 图2 | **OK**¹ |
| `us-export-real-yoy` | 实际出口 YoY | L2X | `EXPGSC1`→yoy | ② 图3 | **OK**¹ |
| `us-import-real-yoy` | 实际进口 YoY | L2X | `IMPGSC1`→yoy | ② 图3 | **OK**¹ |
| `us-federal-deficit-gdp` | 联邦赤字/GDP % | L2G | `FYFSGDA188S` | ② 图4 | **OK**¹ |
| `us-gov-consumption-yoy` | 实际政府消费 YoY | L2G | `GCEC1`→yoy | ② 图4 | **OK**¹ |
| `us-ism-mfg-pmi` | ISM 制造业 PMI | L2S | `mds:ism_us_ism_headline` | **自选** | **OK** |
| `us-ism-nm-pmi` | ISM 非制造业 PMI | L2S | `mds:ism_svc_us_svc_headline` | **自选** | **OK** |

¹ 角色已入台账与 `overviewFredSeedCatalog`；首次部署需 `npm run data:seed-overview` + `data:worker` / `sync-one`。

**目录自选（不进默认两模板）**：`us-ahe-yoy`（时薪）、`us-core-cpi-yoy`、`BOPGSTB`（贸易差额水平）、`CFNAI`、`UMCSENT` 等。

### 3.2 usov 映射（仅经济列，参考）

| usov | 角色 | 说明 |
| --- | --- | --- |
| c13 | us-gdp-saar | ✓ |
| c14–c15 | ISM | ✓ MDS + TE（L2S 自选） |
| c16–c19 | 通胀/PCE | ✓ 模板 ① |
| c20, c22 | 就业 | ✓ 模板 ① |
| c09–c10 | 曲线/政策利率 | ✓ 模板 ① |
| c01–c06, c23–c28 | 市场/流动性 | ✗ |

### 3.3 默认模板绑定（8+8 序列，零重复）

**模板 ①（8）**：gdp-saar, indpro-yoy, unrate, nfp-change, cpi-yoy, core-pce-yoy, fed-target, 10y2y  

**模板 ②（8）**：pce-real-yoy, retail-yoy, pfi-real-yoy, houst, export-real-yoy, import-real-yoy, federal-deficit-gdp, gov-consumption-yoy  

**不在默认模板**：ism-mfg, ism-nm（L2S，目录勾选）

### 3.4 TBD Backlog

| 优先级 | 角色 | 候选源 | 备注 |
| --- | --- | --- | --- |
| P1 | BEA NIPA 直连 | BEA API | 降 GDP/PCE/投资 发布延迟 |
| P2 | 州/local 财政 | Census SF-133 / FRED | 扩展 L2G |
| P3 | 一致预期（Actual−Forecast） | TE / Wind / FactSet | 发布月「预期差」专图（非本模板） |

~~ISM P0~~ → **已 OK**（MDS + TE）。

---

## 第四部分：工程步骤

| 交付 | 路径 | 状态 |
| --- | --- | --- |
| 布局 + 模板 | `overviewAnalysisLayout.ts` | 随 §1.6 更新 |
| 台账 | `overviewSourceRegistry.ts` | 随 §3.1 更新 |
| FRED 种子 | `overviewFredSeedCatalog.ts` | 含 L2I/G/X 扩展 |
| 验证 | `verify-overview.ts` | TBD 不 fail |
| 文档 | `docs/US_OVERVIEW_ANALYSIS.md` | 同步 |

### 4.1 模板规范

- `layoutMode: 4` × 2；**16 个默认 roleId 零重复**
- TBD 角色不进 `selectedKeys`
- `chartIntroNotes` 按 **图位** 写支出法逻辑，非逐指标堆砌

---

## 第五部分：图表 UX

| 序列 | 色 |
| --- | --- |
| GDP | `#f1cd57` |
| 工业 | `#56b6c2` |
| 消费/PCE/零售 | `#d89b4e` / `#f4b165` |
| 投资 | `#5f76b8` |
| 住房开工 | `#6ccad1` |
| 出口 | `#56b6c2` |
| 进口 | `#ef6461` |
| 联邦赤字/GDP | `#9ea68b` |
| 政府消费 | `#6f84c0` |
| 失业/非农/CPI/PCE/政策/曲线 | 同前版 |

---

## 第六部分：验证清单

- [x] §1.6 双模板 **零重复**（已移除 ② 图4 与 ① 图1 重复）
- [x] L2 含 **投资、政府、进出口**
- [x] ISM 保留台账，默认模板改 **自选**
- [ ] 新 FRED 序列 seed + verify `--db` 通过
- [ ] 与 CPI / 就业 / 市场类模板分工明确

---

## 第七部分：禁止事项

- **不要** 在 ① 与 ② 重复同一 `roleId`（尤其 GDP/工业/失业）
- **不要** 用股指/油价替代 L2I/L2G/L2X
- **不要** 因 FRED 暂无序列删除 §3.1 角色（标 TBD）
- **不要** PAYEMS 水平当非农增量

---

## 使用说明

Agent：**§1.6 定稿 → §3.1 台账 → seed/verify → 更新 layout**。  

研究员：① 看总量/就业/通胀/政策；② 看 **C+I+G+NX**；ISM 从目录加 L2S。

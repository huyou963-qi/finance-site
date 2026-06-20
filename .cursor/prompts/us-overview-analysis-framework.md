# Prompt：美国经济 Overview 分析框架 — 多源入库、指标树、调度与宏观模板

---

## 任务目标

以 **美国宏观分析师** 视角，设计并落地一套 **纯经济基本面** 的 Overview 框架：回答「增长、需求、就业、通胀、政策传导」处在什么状态——**不** 覆盖股市、波动率、商品交易、流动性交易或估值比率（这些交给 **行情 / 跨资产 / CPI 分项** 等 **其他模板**）。

1. **分析方法论（§1）**：按宏观逻辑 **独立设计**，不以 `US_Overview.xlsx` 列顺序或 panel 划分为主轴；xlsx/usov 仅作 **可选映射**（§3）。
2. **多源数据（§0）**：FRED → 官方 API → xlsx/mds → 第三方；FRED 无序列 **不删分析角色**，写入 **TBD**（§3.4）。
3. **指标有效性**：写入调度/默认模板前逐条验证；**TBD 不调度、不画空壳线**。
4. **宏观模板**：内置 **2 个** 四图模板（`layoutMode: 4`），指标 **跨模板不重复**；与 **CPI 模板**（通胀结构）、**市场类模板**（资产/流动性）严格分工。

**禁止**因 FRED 缺 ID 而 **删减 §1 分析块**；**禁止**把 SPX/GLD、VIX、WTI、Net Liquidity、股指 PE 等 **纳入本框架**；**禁止**把 API Key 写入代码或种子 JSON。

---

## 第〇部分：多源有效性门禁

### 0.1 什么叫「有效」

| 检查项 | 日频 | 周频 | 月频 | 季频 |
| --- | --- | --- | --- | --- |
| 可拉取/可导入 | 成功且有数值 | 同上 | 同上 | 同上 |
| 最近观测 | ≥ 当前日 − 7 日 | ≥ 当前日 − 14 日 | ≥ 当前月 − 3 月 | ≥ 上一完整季度初 |
| DB 可展示 | 宏观页非空点满足可读 | 同上 | 近 12 月 ≥ 6 | 近 8 季 ≥ 4 |
| 口径 | metadata 含 **单位、频率、来源机构** | 同上 | 同上 | 同上 |

无效 → 不进 **自动调度** 与 **默认模板**；**仍保留** 在 §3 台账与 TBD。

### 0.2 验证顺序

```
1. 以 §3.1 经济角色清单为准（非 xlsx 列数）
2. 按 §0.3 优先级逐源探测，记录最新 obs
3. OK → overviewSourceRegistry / 种子 / catalog
4. 无源 → status=TBD → §3.4
5. verify-overview（待建）+ xlsx/FRED worker 自检
6. 汇报：有效表 + TBD 表
```

```bash
npm run data:probe-sources -- --scope=overview
npm run db:import-us-overview-xlsx   # 仅当 xlsx 含 §3 经济列且需 MDS 轨
npm run data:seed-phase5 && npm run data:worker
```

### 0.3 数据源优先级

| 级 | 类型 | 入库键 | 说明 |
| --- | --- | --- | --- |
| P1 | FRED | `fred:{ID}` | BLS/BEA/Census/Fed 宏观序列 |
| P2 | 官方 API | `api:{agency}:{id}` | BEA NIPA、BLS v2（待建 adapter） |
| P3 | xlsx/mds | `mds:usov_*` | 团队表；**只映射 §3 经济列** |
| P4 | 第三方 | `fmp:*` 等 | 仅当官方/FRED 无等价 **经济** 序列 |
| P5 | 派生 | calc / composite | YoY、diff(NFP)、3MMA 失业等 |
| P6 | TBD | 占位 | 不调度 |

### 0.4 无效 / 缺源时

- **不删** §1 分析块；**不** 用股票、油价、VIX 顶替经济角色。
- 可暂用 **经济代理**（如 INDPRO 辅助解读 PMI），但 **ISM/PMI 槽位保留**，标注 PROXY。
- 市场类 usov（股指、VIX、WTI、黄金、SPX/GLD、Net Liq、PE）→ **不进入本 Prompt 台账**；目录中可存在，**Overview 模板不引用**。

---

## 第一部分：分析框架（宏观分析师独立设计）

### 1.1 核心问题（一条主线）

> **美国经济处于扩张、放缓、还是衰退风险上升？**  
> 通胀是否仍偏离 2% 目标？劳动力是否仍偏紧？货币政策立场对 **实体经济** 是支撑还是制约？

用 **五条经济支柱** 回答（**不含** 资产价格、波动率、原油、黄金、联储资产负债表交易指标）。

### 1.2 五条支柱（L1–L5）

| 支柱 | 回答什么 | 必备指标（中文 displayName） | 为何需要 |
| --- | --- | --- | --- |
| **L1 产出与周期** | 总量增长动能 | 实际 GDP 环比折年率；工业生产指数 YoY | 周期位置锚 |
| **L2 需求与景气** | 内需与前瞻调查 | 实际个人消费支出 YoY；零售销售 YoY；**ISM 制造业 PMI**；**ISM 非制造业 PMI** | 区分「生产」与「需求/服务」 |
| **L3 劳动力** | 就业市场松紧 | 失业率；新增非农就业；平均时薪 YoY | 菲利普斯曲线、消费可持续性 |
| **L4 价格与目标** | 相对 2% 的偏离 | CPI 同比；核心 PCE 同比 | Fed 双 mandate；**不拆 CPI 分项**（→ CPI 模板） |
| **L5 政策与传导** | 货币政策 **对实体** 的立场 | 联邦基金目标利率；10Y-2Y 期限利差 | 政策松紧与衰退预警（**不是** 股市/信用 OAS 交易） |

**L0 合成判断（文字，非第六图）**：综合 L1–L5，给出「扩张 / 放缓 / 停滞 / 衰退风险」四选一 + 1–2 条主因。**不** 用 VIX、股指作 L0 输入。

### 1.3  deliberately 排除（其他模板）

| 类别 | 示例 | 归属 |
| --- | --- | --- |
| 股指 / 估值 | 标普、纳指、PE、SPX/GLD | 行情 / 跨资产模板 |
| 波动率 | VIX | 同上 |
| 大宗商品交易 | WTI、COMEX 黄金 | 商品 / 通胀供给模板 |
| 流动性交易 | Fed 总资产、Net Liquidity、联储持债 WoW | 流动性 / QT 模板 |
| 信用定价 | HY OAS、IG spread | 信用 / 金融条件模板 |
| CPI 结构 | OER、能源、核心商品/服务 | `.cursor/prompts/us-cpi-analysis-framework.md` |

### 1.4 五问决策树（写入模板 ① 介绍）

| 问 | 看哪条支柱 | 异常时 |
| --- | --- | --- |
| ① GDP/工业走弱？ | L1 | L2 零售/PCE、ISM 是否同步走弱 |
| ② ISM 与 hard data 谁领先？ | L2 vs L1 | 调查偏强但 IP 弱 → 注意修订风险 |
| ③ 失业/NFP/工资？ | L3 | 工资仍高 + 失业低 → 通胀粘性风险（→ CPI 模板） |
| ④ CPI 与核心 PCE？ | L4 | 背离 → 强调 Fed 看 PCE；结构 → CPI 模板 |
| ⑤ 政策利率与曲线？ | L5 | 曲线深度倒挂 + L1 弱 → 衰退概率上升 |

**80% 场景**：模板 ① 四图覆盖 L1/L3/L4/L5 要点 + 文字提 L2；L2 细节或 ISM 专图 → 模板 ②。

### 1.5 变动率规则

| 序列 | calc |
| --- | --- |
| GDP SAAR | `none` |
| CPI/PCE/PCE 实际消费/零售 指数 | `yoy`（必要时 `mom`） |
| PAYEMS | `diff` → 非农增量 |
| UNRATE、PMI、Fed 目标利率、10Y-2Y | `none` |
| 时薪指数 | `yoy` |

### 1.6 两模板链条

```
模板 ① 经济 Overview · 四支柱快照（必看）
    图1  L1  增长：GDP SAAR + 工业生产 YoY
    图2  L3  就业：失业率 + 新增非农
    图3  L4  通胀锚：CPI YoY + 核心 PCE YoY
    图4  L5  政策：联邦基金目标 + 10Y-2Y
    → 可写经济 Overview 段落 → 停

模板 ② 经济 Overview · 需求与景气（按需）
    图1  L2  消费：实际 PCE YoY + 零售 YoY
    图2  L2  调查：ISM 制造业 PMI + ISM 非制造业 PMI
    图3  L3  工资：平均时薪 YoY + 失业率（右轴）
    图4  L1  补充：工业生产 + GDP SAAR（右轴，看 hard data 一致性）
    → 与 ① 合并；仍缺 CPI 结构 → CPI 模板
```

**不** 在任一模板出现：VIX、WTI、黄金、股指、Net Liq、OAS、PE。

---

## 第二部分：与本仓库代码的关系

| 模块 | 路径 | 与本框架关系 |
| --- | --- | --- |
| `usOverviewLayout.ts` | 28 列 usov | **仅 §3.2 经济列** 可映射；市场列 **不引用** |
| `usovFredMap.ts` | 部分 FRED | 只维护 §3.1 经济序列映射 |
| `import-us-overview-xlsx.ts` | xlsx→mds | 经济列作 P3 回填 |
| `fredCatalog.ts` | 美国目录 | 挂 **经济类** category |
| CPI 框架 | `us-cpi-analysis-framework.md` | 通胀 **结构** |
| Phase5 文档 | `DATA_SCHEDULER_PHASE5.md` | 调度参考 |

**设计原则**：§1 台账 **不** 按 xlsx panel 1/6 组织；实现时 `overviewAnalysisLayout.ts` 跟 §1.6，不是跟 xlsx 行号。

---

## 第三部分：经济指标台账（非 xlsx 全集）

### 3.1 角色清单（框架必备）

| 经济角色 ID | displayName | 支柱 | 首选 FRED | 备选 / 备注 | 状态 (2026-06-19) |
| --- | --- | --- | --- | --- | --- |
| `us-gdp-saar` | 实际 GDP 环比折年率 | L1 | `A191RL1Q225SBEA` | BEA API；`usov_c13` | **OK** Q2026-01 |
| `us-indpro-yoy` | 工业生产 YoY | L1 | `INDPRO`→yoy | `IPMAN` 补充 | **OK** 2026-05 |
| `us-pce-real-yoy` | 实际个人消费支出 YoY | L2 | `PCEC96`→yoy | BEA | **OK** |
| `us-retail-yoy` | 零售销售 YoY | L2 | `RSAFS`→yoy | Census | **OK** 2026-05 |
| `us-ism-mfg-pmi` | ISM 制造业 PMI | L2 | — | xlsx `usov_c15`；ISM 授权 | **TBD→MDS** |
| `us-ism-nm-pmi` | ISM 非制造业 PMI | L2 | — | xlsx `usov_c14` | **TBD→MDS** |
| `us-unrate` | 失业率 | L3 | `UNRATE` | `usov_c20` | **OK** 2026-05 |
| `us-nfp-change` | 新增非农就业 | L3 | `PAYEMS`→diff | `usov_c22` | **OK** |
| `us-ahe-yoy` | 平均时薪 YoY | L3 | `CES0500000003`→yoy | BLS | **OK** 2026-05 |
| `us-cpi-yoy` | CPI 同比 | L4 | `CPIAUCSL`→yoy | `usov_c16` | **OK** 2026-05 |
| `us-core-pce-yoy` | 核心 PCE 同比 | L4 | `PCEPILFE`→yoy | `usov_c19` | **OK** 2026-04 |
| `us-fed-target` | 联邦基金目标利率 | L5 | `DFEDTARU` | `usov_c10` | **OK** 2026-06-19 |
| `us-10y2y` | 10Y-2Y 利差 | L5 | `T10Y2Y` | `usov_c09` | **OK** 2026-06-18 |

**目录自选（不进默认两模板，仍属经济扩展）**：

| 角色 | displayName | FRED | 用途 |
| --- | --- | --- | --- |
| `us-core-cpi-yoy` | 核心 CPI 同比 | `CPILFESL`→yoy | 与 PCE 对照 |
| `us-pce-yoy` | PCE 同比 | `PCEPI`→yoy | 名义锚 |
| `us-cfnai` | 芝加哥联储 CFNAI | `CFNAI` | L0 合成参考 |
| `us-umich` | 密歇根消费者信心 | `UMCSENT` | L2 情绪（非资产） |

### 3.2 usov 映射（**仅经济列**，实现参考）

| usov | 映射角色 | 纳入本框架 |
| --- | --- | --- |
| c13 | us-gdp-saar | ✓ |
| c14–c15 | ISM NM / Mfg | ✓（TBD 源） |
| c16–c19 | CPI / Core CPI / PCE / Core PCE | ✓（模板 ① 用 c16+c19；余自选） |
| c20, c22 | 失业 / 非农 | ✓ |
| c07–c12, c09–c11 | 国债收益率、目标、EFFR、10Y-2Y | **仅** c10+c09（L5）；EFFR/2Y **不进默认模板** |
| c01–c06, c23–c28 | 股指、商品、Fed BS、PE、Net Liq | **✗ 本框架** |

### 3.3 默认模板绑定（仅 OK + 已验证 MDS）

**模板 ①**：gdp-saar, indpro-yoy, unrate, nfp-change, cpi-yoy, core-pce-yoy, fed-target, 10y2y  

**模板 ②**：pce-real-yoy, retail-yoy, ism-mfg, ism-nm, ahe-yoy, unrate, indpro-yoy, gdp-saar  

ISM 在 MDS/xlsx 就绪前：模板 ② 图 2 **留空或仅文字说明**，**不** 用 INDPRO 占满该 panel（INDPRO 已在 ① 图 1 / ② 图 4）。

### 3.4 TBD Backlog（经济源待研究）

| 优先级 | 角色 | 候选源 | 备注 |
| --- | --- | --- | --- |
| P0 | ISM 制造 + 非制造 PMI | xlsx→mds；ISM 订阅；Trading Economics | 框架 **必备**；FRED 无免费稳定 ID |
| P1 | BEA/BLS 直连 | 降 PCE/GDP 延迟 | 现经 FRED 可接受 |
| P2 | 初请 / JOLTS 等 | `ICSA`, `JTSJOL` | 目录扩展，非默认四图 |

**不在此 backlog**：黄金、WTI、VIX、股指、PE、Net Liquidity（不属于本框架）。

---

## 第四部分：工程步骤（Agent 实现）

| 交付 | 路径 |
| --- | --- |
| 布局 + 模板介绍 | `overviewAnalysisLayout.ts` |
| 经济源注册表 | `overviewSourceRegistry.ts` |
| FRED 种子 | `overviewFredSeedCatalog.ts`（**仅 §3.1 OK 行**） |
| 验证 | `verify-overview.ts`（TBD 不 fail 构建） |
| 分析文档 | `docs/US_OVERVIEW_ANALYSIS.md`（§1 五支柱） |
| 调度文档 | `docs/DATA_SCHEDULER_OVERVIEW.md` |
| 内置模板 | `macroPresetTemplates.ts`：`builtin-us-econ-overview` + `builtin-us-econ-demand` |

**模板文件夹**：`folder-builtin-us-economy`（美国经济 Overview），与 CPI 文件夹并列。

### 4.1 模板规范

- `layoutMode: 4` × 2；跨模板 **不重复** 同一 `经济角色 ID`
- 与 CPI 模板 **零重复** OER/能源等
- 与 **市场类** 模板 **零重复** 股指/VIX/商品/Net Liq
- `description` ≤3 句；`chartIntroNotes` 每图 2–4 句

---

## 第五部分：图表 UX

| 序列 | 色 |
| --- | --- |
| GDP | `#f1cd57` |
| 工业 | `#56b6c2` |
| 失业 | `#f2cf67` |
| 非农 | `#9ea68b` |
| CPI | `#ef6461` |
| 核心 PCE | `#7fc8c5` |
| 政策利率 | `#6f84c0` |
| 10Y-2Y | `#d75a68` |
| PCE/零售 | `#d89b4e` |
| ISM | `#56b6c2` |
| 时薪 | `#9ea68b` |

右轴：失业 vs 时薪；GDP vs 工业（模板 ② 图 4）。

---

## 第六部分：验证清单

- [ ] §1 **五支柱** 完整，**无** 市场/商品/流动性交易指标
- [ ] §3.1 台账齐全；TBD 仅 **经济** 序列（ISM 等）
- [ ] 默认模板 **仅** §3.3 绑定
- [ ] usov **市场列** 未出现在 Overview 模板键中
- [ ] 与 CPI 模板分工明确
- [ ] 多源验证日志 + MDS ISM 可展示（若 xlsx 有）
- [ ] 未提交密钥

---

## 第七部分：禁止事项

- **不要** 在本框架加入 SPX/GLD、VIX、WTI、黄金、股指、PE、Net Liquidity、HY OAS
- **不要** 以 `US_Overview.xlsx` 六 panel **定义** 分析结构（仅作 usov 映射参考）
- **不要** 因 FRED 缺 ISM 而 **删除 L2 调查支柱**
- **不要** 用 **资产价格** 替代 **经济 hard data** 作默认图
- **不要** 在 Overview 做 CPI **分项**（→ CPI 模板）
- **不要** 把 PAYEMS **水平** 当非农增量

---

## 第八部分：技术参考

| 项目 | 路径 |
| --- | --- |
| 本 Prompt | `.cursor/prompts/us-overview-analysis-framework.md` |
| CPI 框架 | `.cursor/prompts/us-cpi-analysis-framework.md` |
| usov 列（映射用） | `src/lib/data/usOverviewLayout.ts` |
| FRED 映射 | `src/lib/data/scheduler/usovFredMap.ts` |
| xlsx 导入 | `scripts/import-us-overview-xlsx.ts` |

---

## 使用说明

Agent：**§1 五支柱定稿 → §3 经济台账 → 多源验证 → 2 模板 → 汇报**。  

研究员：**ISM 等 TBD** 在 §3.4 选定源后单独开任务升级 status。  

**行情、流动性、通胀结构** → 使用 **其他模板**，不在本 Prompt 扩展。

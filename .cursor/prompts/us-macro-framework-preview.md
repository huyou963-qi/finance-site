# Prompt：美国宏观分析框架 Preview 页面

> 用途：复制下方「--- PROMPT START ---」至「--- PROMPT END ---」整段，交给 Cursor Agent / Canvas / v0 等，生成一个**可交互的 Preview 网页**（无需接真实 API，用 mock 数据即可）。

--- PROMPT START ---

## 任务

生成一个**美国宏观分析框架**的 Preview 网页（单页 SPA），用于展示宏观分析师的工作台原型。页面为**中文 UI**，指标与政策均为**美国**数据口径。要求视觉专业（金融终端风格、深色主题），并包含**可点击、可动画的政策—指标传导路径**。

## 技术约束

- 使用 **React + TypeScript** 单文件或少量组件（适合 Canvas / StackBlitz Preview）
- 样式：**Tailwind CSS** 或内联 CSS；深色背景（`#0a0e17` 类），accent 色区分领先/同步/滞后
- **不接后端**；所有指标用 realistic mock 值（含最新观测日期、环比/同比、方向箭头 ↑↓→）
- 必须可在浏览器直接打开预览，无 build 依赖为佳；若用 Vite 结构需可一键运行
- 响应式：≥1280px 为桌面主布局；移动端可折叠侧边栏

## 页面信息架构（5 层）

### Layer 0 — 顶栏：美国周期定位

展示一行摘要卡片：

| 元素 | Mock 示例 |
|------|-----------|
| 周期阶段 | 「晚期扩张 / Late Expansion」 |
| Nowcast GDP（Atlanta Fed GDPNow 风格） | +2.1% SAAR |
| 衰退概率（NY Fed 风格） | 28%（未来 12 个月） |
| 扩散指数 | 领先指标 62% 向好 |
| 政策组合 | 「限制性货币 + 中性财政」 |
| 金融条件 FCI | 偏紧（+0.4σ） |

### Layer 1 — 核心矩阵：三类指标 × 部门

横向三列：**领先 | 同步 | 滞后**  
纵向行：**企业部门（含 SIC 行业）| 金融部门 | 居民部门 | 政府（财政）| 央行（货币）| 外部门**

每个指标卡片包含：英文名、中文名、最新值、单位、发布频率、数据日期、较上期变化、sparkline（迷你折线 mock）。

点击卡片 → 右侧/底部详情抽屉：定义、为何属于该时序、与哪些政策/指标有传导关系。

---

## 美国指标目录（必须使用以下指标）

### 企业部门 — 总量指标

| 时序 | 指标（EN / CN） | 来源风格 |
|------|-----------------|----------|
| 领先 | ISM Manufacturing PMI / 制造业 PMI | ISM |
| 领先 | ISM New Orders / 新订单指数 | ISM |
| 领先 | Durable Goods Orders ex-Transport / 耐用品订单（除运输） | Census |
| 领先 | Nonresidential Construction Put in Place / 非住宅营建支出 | Census |
| 领先 | Initial Jobless Claims (4-wk avg) / 初请失业金（4周均值） | DOL |
| 同步 | Industrial Production Index / 工业生产指数 | Fed G.17 |
| 同步 | Manufacturing & Trade Inventories / 制造业和贸易库存 | Census |
| 同步 | Nonfarm Business Sector Output / 非农企业产出 | BLS |
| 同步 | Corporate Profits After Tax / 税后企业利润 | BEA |
| 滞后 | Unit Labor Cost / 单位劳动力成本 | BLS |
| 滞后 | Inventory-to-Sales Ratio / 库销比 | Census |
| 滞后 | Capacity Utilization: Manufacturing / 制造业产能利用率 | Fed |

### 企业部门 — SIC 大类行业矩阵

按 **SIC Division** 列出以下行业，每个行业展示 1 个代表性领先/同步 mock 指标（如产出、就业或营收增速），并标注 **周期属性**：

| SIC | 行业（CN） | 周期分类 | 标签色 |
|-----|-----------|----------|--------|
| A 01-09 | 农林渔 | 防御 | green |
| B 10-14 | 采矿 | **周期** | orange |
| C 15-17 | 建筑 | **周期** | orange |
| D 20-39 | 制造业（综合） | **周期** | orange |
| D 20-21 | 食品及相关 | 防御 | green |
| D 22-23 | 纺织 /  apparel | 周期 | orange |
| D 24-25 |  lumber / 家具 | 周期 | orange |
| D 26-27 | 纸品 / 印刷 | 周期 | orange |
| D 28 | 化工 | 混合（偏周期） | yellow |
| D 29 | 石油炼制 | **周期** | orange |
| D 30-31 | 橡胶塑料 / 皮革 | 周期 | orange |
| D 32-33 | 石材 clay / 玻璃 | 周期 | orange |
| D 34 | 金属制品 | **周期** | orange |
| D 35 | 工业机械 / 计算机设备 | **成长** | blue |
| D 36 | 电子及其他电气设备 | **成长** | blue |
| D 37 | 运输设备（汽车、航空航天） | **周期** | orange |
| D 38-39 | 仪器 / 其他制造 | 成长 | blue |
| E 40-49 | 交通与公用事业 | 混合 | yellow |
| E 40-42 | 铁路运输 / 卡车 / 仓储 | 周期 | orange |
| E 44-45 | 水路 / 航空运输 | 周期 | orange |
| E 48 | 通信 | 成长 | blue |
| E 49 | 电力 / 燃气 /  санitary | **防御** | green |
| F 50-51 | 批发贸易 | 周期 | orange |
| G 52-59 | 零售贸易 | 周期 | orange |
| G 54 | 建材 / 园艺零售 | 周期 | orange |
| G 58 | 餐饮 / 酒旅 | 周期 | orange |
| H 60-67 | 金融、保险、房地产 | **周期**（顺周期） | orange |
| I 70-89 | 服务业（综合） | 混合 | yellow |
| I 70-72 | 酒店 / 个人服务 | 周期 | orange |
| I 73-74 | 商业服务 / 计算机编程 | 成长 | blue |
| I 78-79 | 影视 / 娱乐 / 医疗 | 成长/防御 | blue/green |
| I 80 | 健康服务 | **防御** | green |
| J 91-99 | 公共管理 | 滞后/政策 | gray |

**UI 要求**：企业部门 expandable panel，默认显示周期/成长/防御三个 filter chip，可筛选行业行；每行显示 SIC 代码、行业名、分类 badge、mock 产出/就业 YoY。

### 金融部门

| 时序 | 指标 |
|------|------|
| 领先 | Senior Loan Officer Survey (C&I tightening) / 银行贷款官员调查 |
| 领先 | High Yield OAS / 高收益债利差 |
| 领先 | 2s10s Treasury Spread / 2-10年国债利差 |
| 领先 | Chicago Fed NFCI / 全国金融条件指数 |
| 同步 | Commercial & Industrial Loans / 商业工业贷款存量 |
| 同步 | M2 Money Stock YoY / M2 同比 |
| 同步 | S&P 500 (level & YoY) / 标普500 |
| 滞后 | Bank Credit Delinquency Rate / 银行拖欠率 |
| 滞后 | Charge-off Rate on C&I Loans / 贷款核销率 |
| 滞后 | Household Net Worth (Financial Accounts) / 家庭净财富 |

### 居民部门

| 时序 | 指标 |
|------|------|
| 领先 | U Michigan Consumer Sentiment / 密歇根消费者信心 |
| 领先 | Conference Board Leading Consumer Expectations / 谘商会消费者预期 |
| 领先 | Building Permits / 建筑许可 |
| 领先 | Existing Home Sales / 成屋销售 |
| 同步 | Personal Consumption Expenditures / 个人消费 PCE |
| 同步 | Retail Sales ex-Auto / 零售销售（除汽车） |
| 同步 | Nonfarm Payrolls / 非农就业 |
| 同步 | Average Hourly Earnings YoY / 平均时薪同比 |
| 滞后 | Unemployment Rate (U3) / 失业率 |
| 滞后 | Labor Force Participation Rate / 劳动参与率 |
| 滞后 | Real Disposable Personal Income / 实际可支配个人收入 |

### 政府 — 财政政策

| 时序 | 指标 |
|------|------|
| 领先 | Treasury Fiscal Data: Budget Deficit 12m rolling / 滚动12个月联邦赤字 |
| 领先 | New Contract Awards (proxy mock) / 联邦新签合同 |
| 同步 | Federal Government Current Expenditures / 联邦当期支出 |
| 同步 | State & Local Government Spending / 州和地方支出 |
| 滞后 | Federal Debt to GDP / 联邦债务/GDP |
| 滞后 | Primary Surplus / Deficit / 初级财政余额 |
| 滞后 | Interest Payments / Federal Revenue / 利息占财政收入比 |

### 央行 — 货币政策

| 时序 | 指标 |
|------|------|
| 领先 | Fed Funds Futures implied path / 联邦基金利率期货隐含路径 |
| 领先 | 5y5y Forward Inflation Expectation / 5y5y 远期通胀预期 |
| 领先 | 2-year Treasury Yield / 2年期国债收益率 |
| 同步 | Effective Federal Funds Rate / 有效联邦基金利率 |
| 同步 | Fed Balance Sheet Total Assets / 联储资产负债表 |
| 同步 | Real Policy Rate (FFR - Core PCE YoY) / 实际政策利率 |
| 滞后 | Core PCE YoY / 核心 PCE 同比（Fed 目标） |
| 滞后 | Core CPI YoY / 核心 CPI 同比 |
| 滞后 | Wage-Price momentum (ECI YoY) / 雇佣成本指数 |

### 外部门

| 时序 | 指标 |
|------|------|
| 领先 | ISM Manufacturing New Export Orders / 新出口订单 |
| 领先 | USD Broad Trade-Weighted Index / 美元广义贸易加权指数 |
| 同步 | Goods Trade Balance / 商品贸易差额 |
| 同步 | Current Account Balance / 经常账户 |
| 滞后 | Net International Investment Position / 净国际投资头寸 |
| 滞后 | Terms of Trade index / 贸易条件指数 |

### 通胀子系统（横切，独立 Tab 或顶栏）

- Core PCE YoY（Fed 目标）
- Core CPI YoY
- Supercore (services ex-housing) mock
- Atlanta Fed Sticky CPI / Flexible CPI 风格 mock
- Breakeven Inflation 5Y / 10Y
- Employment Cost Index YoY

---

## Layer 2 — 动态传导路径（核心交互）

页面中央或右侧固定 **「传导图」** 面板（可用 SVG + CSS animation 或 React Flow 风格），展示以下**可切换场景**：

### 场景 A：货币政策收紧（Restrictive Monetary）

路径动画（粒子沿箭头流动，500–800ms/easing）：

```
Core PCE↑ + Nonfarm Payrolls 强
  → FOMC 维持高 FFR / 点阵图 higher for longer
    → 2s10s 利差走阔或倒挂加深
      → HY OAS 走阔（金融领先）
        → C&I 贷款收紧（金融同步）
          → ISM New Orders↓（企业领先）
            → Industrial Production↓（企业同步）
              → Unemployment Rate↑（居民滞后）
                → Core PCE↓（通胀滞后反馈）
```

### 场景 B：财政政策扩张（Expansionary Fiscal）

```
Federal Deficit 扩大 + Transfer Payments↑
  → Real Disposable Income↑（居民滞后/同步）
    → Retail Sales / PCE↑（居民同步）
      → Corporate Profits↑（企业同步）
        → Nonresidential Construction↑（企业领先）
          → Nonfarm Payrolls↑
            → 通胀预期↑ → Fed 反应函数（虚线回连到场景 A）
```

### 场景 C：外生冲击 — 油价上涨（Supply Shock）

```
WTI / Energy SIC(29) 价格↑
  → Headline CPI↑
    → Real Disposable Income↓（实际收入）
      → Consumer Sentiment↓（领先）
        → Retail ex-Auto 放缓（同步）
          → Fed 两难：growth↓ vs inflation↑（政策节点闪烁警告）
```

### 场景 D：金融条件收紧（Credit Crunch）

```
NFCI↑ + Senior Loan Officer 收紧
  → Commercial & Industrial Loans↓
    → Cyclical SIC（建筑37、金属34、零售G）产出下滑领先
      → HY 违约率↑（滞后）
        → 财富效应：Financial Accounts 净财富↓
```

**交互要求**：

1. 顶部下拉或 Tab 切换场景 A/B/C/D
2. 点击传导图任一节点 → 高亮矩阵中对应指标卡片 + 滚动到可见
3. 点击矩阵指标 → 传导图中相关节点 pulse 高亮
4. 每条边标注：**传导渠道**（利率 / 信贷 / 汇率 / 财富 / 预期）+ **典型时滞**（如 3–6M、6–12M）
5. 政策节点（Fed / Treasury）用六边形，指标节点用圆角矩形，部门用背景色分区

### 政策反应函数面板（传导图下方）

展示简化 Taylor Rule mock：

- `i* = r* + π + 0.5(π - 2%) + 0.5(output gap)`
- 显示当前 mock：FFR、Core PCE、Output Gap → 隐含利率 vs 实际 FFR 偏差（「过紧 / 合适 / 过松」）

---

## Layer 3 — 金融条件与杠杆（底部横条）

4 个 gauge / 进度条：

| 指标 | Mock |
|------|------|
| Chicago Fed NFCI | +0.32（偏紧） |
| Household Debt / GDP | 75% |
| Nonfinancial Corporate Debt / GDP | 52% |
| Federal Debt / GDP | 98% |

配色：绿（健康）→ 黄（警戒）→ 红（危险）

---

## Layer 4 — 情景与一致性（右侧面板）

**三情景卡片**：Baseline / Upside / Downside（2026H2 mock）

**矛盾信号检测**（至少 3 条 mock alert）：

- ⚠ ISM PMI > 50 但 Industrial Production 3个月停滞 → 「软数据 vs 硬数据背离」
- ⚠ 失业率低但 Consumer Sentiment 走弱 → 「萨姆规则未触发但情绪领先下滑」
- ✓ HY OAS 与 NFCI 同向走阔 → 「金融条件一致收紧」

**数据日历**：未来 7 天美国发布 mock（CPI、PPI、FOMC、Jobless Claims、PMI）

---

## 视觉与 UX 规范

### 色彩

- 领先指标：cyan / `#22d3ee`
- 同步指标：amber / `#fbbf24`
- 滞后指标：rose / `#fb7185`
- 周期行业：orange badge
- 成长行业：blue badge
- 防御行业：green badge
- 政策节点：purple / `#a78bfa`

### 字体

- 英文指标名：`JetBrains Mono` 或 `IBM Plex Mono`
- 中文：`system-ui` 或 `Noto Sans SC`

### 动效

- 场景切换：传导路径 **sequential reveal**（节点依次点亮，1.5s 总时长）
- 悬停指标卡片：轻微 elevation + border glow
- 无卡顿；动画可 `prefers-reduced-motion` 降级为静态高亮

### 图例

页面左下角固定图例：时序颜色、周期分类、传导渠道线型（实线=流量，虚线=预期，点线=时滞反馈）

---

## 组件结构建议

```
UsMacroFrameworkPreview/
├── index.tsx              # 页面入口
├── CycleBanner.tsx        # Layer 0
├── IndicatorMatrix.tsx    # Layer 1 主矩阵
├── SicIndustryPanel.tsx   # 企业 SIC  expandable
├── TransmissionGraph.tsx  # Layer 2 SVG/ReactFlow 动态传导
├── PolicyReactionFn.tsx   # Taylor rule 面板
├── FinancialConditions.tsx# Layer 3
├── ScenarioPanel.tsx      # Layer 4
├── mockData.ts            # 全部 mock 指标与 SIC 数据
└── types.ts               # Indicator, Sector, SicDivision, TransmissionNode
```

---

## 数据类型（TypeScript）

```typescript
type IndicatorTiming = 'leading' | 'coincident' | 'lagging';
type Sector = 'corporate' | 'financial' | 'household' | 'fiscal' | 'monetary' | 'external';
type IndustryCycleTag = 'cyclical' | 'growth' | 'defensive' | 'mixed';
type TransmissionChannel = 'interest_rate' | 'credit' | 'exchange_rate' | 'wealth' | 'expectations';

interface MacroIndicator {
  id: string;
  nameEn: string;
  nameZh: string;
  timing: IndicatorTiming;
  sector: Sector;
  value: number;
  unit: string;
  prevValue: number;
  releaseFreq: string;
  asOfDate: string;
  source: string;
}

interface SicIndustryRow {
  sicRange: string;
  nameZh: string;
  nameEn: string;
  cycleTag: IndustryCycleTag;
  mockOutputYoY: number;
  mockEmploymentYoY: number;
  relatedIndicatorIds: string[];
}

interface TransmissionEdge {
  from: string;
  to: string;
  channel: TransmissionChannel;
  lagMonths: string; // e.g. "3-6"
  label?: string;
}

interface TransmissionScenario {
  id: string;
  titleZh: string;
  descriptionZh: string;
  nodes: { id: string; labelZh: string; type: 'indicator' | 'policy' | 'sector' }[];
  edges: TransmissionEdge[];
}
```

---

## 验收标准

- [ ] 全部 6 个部门 × 3 类时序均有指标卡片（企业部门额外含 ≥20 行 SIC 行业）
- [ ] SIC 行业可按 周期/成长/防御 筛选
- [ ] ≥4 个传导场景可切换，路径有顺序动画
- [ ] 指标卡片与传导图 **双向联动** 高亮
- [ ] 中文 UI，美国指标英文名保留
- [ ] 深色金融终端风格，1280px 下布局不溢出
- [ ] 所有数值为 plausible 2026 年美国 mock，非空占位符

## 禁止

- 不要接 FRED/API（本 Preview 仅 mock）
- 不要用 Lorem ipsum
- 不要省略 SIC 行业分类
- 不要静态截图式页面——传导必须是**动态可交互**的

--- PROMPT END ---

## 使用说明

1. 整段复制「PROMPT START」至「PROMPT END」给 Agent
2. 若用 **Cursor Canvas**：要求输出 `.canvas.tsx` 单文件可运行版本
3. 若接入 finance-site：后续可将 `mockData.ts` 替换为 `GET /api/data/macro` 映射表

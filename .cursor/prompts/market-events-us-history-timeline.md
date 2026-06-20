# Prompt：美国历史经济时代时间线（建国至今）→ 事件记录器

> **角色**：你是一名历史经济学家，任务是把美国自建国以来的宏观—政治—金融史整理成 **「大时代阶段 + 阶段内重要事件」** 的两层时间线，并写入本站事件记录器数据库。  
> **视觉目标**（见团队草图）：左侧纵向时间轴；每一 **时代阶段** 为一档可折叠区块；阶段标题旁为起止年份与阶段名；阶段正文解释 **为何繁荣 / 为何萧条（或转型）**；其下缩进列出该阶段内的 **重要事件**（每条可链向 Wikipedia）。

---

## 一、设计原则

| 原则 | 说明 |
|------|------|
| **两层结构** | 上层 = **时代阶段**（Era）；下层 = **阶段内事件**（Event）。禁止把阶段与事件混为同一层级。 |
| **独立标签** | 每个时代阶段必须有 **唯一中文短标签**（如 `柯立芝繁荣`、`大萧条`），用于筛选与折叠分组。 |
| **周期叙事** | 每个阶段正文必须回答：本阶段 **增长/繁荣的驱动力** 与 **衰退/危机/萧条的原因**（若无明显萧条，写「约束与脆弱性」）。 |
| **穷尽收录** | **不设每阶段事件条数上限**。凡对美国经济、金融、财政、货币、贸易、就业或国家走向产生 **显著影响** 的事件均应入库（见 **1.1**）。 |
| **Wikipedia** | 阶段与事件尽量提供 **英文 Wikipedia** 链接（`sourceUrl` 或阶段 `wikipediaUrl`）；无可靠页面则填 `null`，**勿编造**。 |
| **可折叠** | 阶段默认 **展开** 前 3 个、**折叠** 其余（见 JSON `defaultExpanded`）；前端按 `[era:...]` 标记分组展示。 |
| **时间跨度** | **1776-07-04（独立宣言）— 当前年份**。 |
| **幂等入库** | 阶段与事件均设全局唯一 `seedKey`；重复 seed 须 skipped。 |

### 1.1 必须收录的事件类型（不限数量）

在对应时代阶段下 **逐条入库**，包括但不限于：

| 类型 | 示例 |
|------|------|
| **宏观政策与立法** | 关税法、银行法、税改、社保/医保、产业补贴、贸易协定 |
| **货币与财政** | 金本位变动、联储成立/主席更迭/重大决议、财政刺激/紧缩、债务上限、关门 |
| **战争与地缘** | 独立战争、内战、两次大战、朝鲜/越南/海湾/反恐/俄乌等 **对美国财政、贸易、能源、军工、通胀有直接传导** 的节点 |
| **金融危机与市场** | 恐慌、股灾、银行危机、储贷危机、次贷危机、区域银行事件 |
| **外部冲击** | 石油禁运、大流行、制裁与反制裁、全球衰退传导 |
| **结构转型** | 废奴与重建、工业化高峰、布雷顿森林/尼克松冲击、全球化、页岩革命、AI/产业政策 |
| **监管里程碑** | 反垄断、SEC/FDIC、格拉斯-斯蒂格尔及废除、Dodd-Frank 等 |

**排除**（勿单独成条）：与宏观/政策/市场 **无实质关联** 的娱乐体育、纯绯闻；无法核实日期者；同一事件重复表述。

**去重**：同一 `seedKey` 或同标题同日期仅一条；跨阶段边界的事件 **归入影响更持久的那一档**，正文说明时间归属理由。

---

## 二、时代阶段划分（建议框架，可微调 ±2 年）

执行时可合并过小阶段，但 **全时间线须覆盖 1776—今、无空档**；阶段数建议 **12–16 个**。  
下列「事件范围」仅为 **类别提示**，执行时须 **按 1.1 穷尽补全**，不得仅写示例几条。

<details open>
<summary><strong>1. 建国与宪政秩序</strong> · 标签 <code>建国宪政</code> · 1776 — 1815</summary>

- **繁荣动力**：独立后领土扩张、农业出口、汉密尔顿金融框架（国债、第一银行）、1790s 商业复苏。  
- **萧条/危机**：独立战争通胀与债务、1797 恐慌、1812 战争扰动、1814 财政压力。  
- **Wikipedia 入口**：[History of the U.S. (1776–1789)](https://en.wikipedia.org/wiki/History_of_the_United_States_(1776%E2%80%931789))  
- **事件范围**：独立/宪法/权利法案、汉密尔顿三报告、第一/第二银行争议、1792 纽交所、1807 禁运、1812 战争与和约等 **全部显著条目**。
</details>

<details>
<summary><strong>2. 市场革命与杰克逊民主</strong> · 标签 <code>市场革命</code> · 1815 — 1860</summary>

- **繁荣动力**：运河/铁路、工厂制、西部开发、1840s–50s 铁路与电报投资潮。  
- **萧条/危机**：1819 恐慌、1837 恐慌、1857 恐慌、奴隶制与关税政治撕裂。  
- **Wikipedia**：[Market Revolution](https://en.wikipedia.org/wiki/Market_revolution)  
- **事件范围**：1819/1837/1857 恐慌、杰克逊杀死第二银行、自由银行法、电报/铁路泡沫、关税（1828/1846）、淘金热、堪萨斯-内布拉斯加法等。
</details>

<details>
<summary><strong>3. 内战与重建</strong> · 标签 <code>内战重建</code> · 1861 — 1877</summary>

- **繁荣动力**：北方工业化、战争动员、铁路军需、宅地法。  
- **萧条/危机**：南方毁灭、绿背通胀与紧缩、重建失败、1873 恐慌起点。  
- **Wikipedia**：[American Civil War](https://en.wikipedia.org/wiki/American_Civil_War)  
- **事件范围**：内战关键节点、绿背、国家银行法、宅地/太平洋铁路法、重建修正案、1873 恐慌等。
</details>

<details>
<summary><strong>4. 镀金时代与第二次工业革命</strong> · 标签 <code>镀金时代</code> · 1877 — 1893</summary>

- **繁荣动力**：铁路网、钢铁/石油/电力、移民劳动力、1879 恢复金兑付。  
- **萧条/危机**：垄断与腐败、劳工冲突、1893 大恐慌、1896 白银辩论。  
- **Wikipedia**：[Gilded Age](https://en.wikipedia.org/wiki/Gilded_Age)  
- **事件范围**：1873/1893 恐慌、谢尔曼法、铁路罢工、金本位恢复、人口与移民政策等。
</details>

<details>
<summary><strong>5. 进步主义与帝国扩张</strong> · 标签 <code>进步主义</code> · 1893 — 1914</summary>

- **繁荣动力**：企业整合、电气/汽车、出口与金本位稳定期。  
- **萧条/危机**：1907 恐慌、托拉斯反弹、1913 前无中央银行。  
- **Wikipedia**：[Progressive Era](https://en.wikipedia.org/wiki/Progressive_Era)  
- **事件范围**：1907 恐慌、联储成立、所得税修正案、反垄断诉讼、巴拿马运河、美西战争及经济后果等。
</details>

<details>
<summary><strong>6. 一战与咆哮的二十年代</strong> · 标签 <code>咆哮二十年代</code> · 1914 — 1929/10</summary>

- **繁荣动力**：战时产能→和平转换、信贷扩张、柯立芝减税、1923–29 股市繁荣。  
- **萧条/危机**：1920–21 衰退、农业萧条、杠杆与泡沫→1929。  
- **Wikipedia**：[Roaring Twenties](https://en.wikipedia.org/wiki/Roaring_Twenties)  
- **事件范围**：参战、1918–21 通胀与衰退、联邦储备 1920s 政策、1929 崩盘前所有重大政策/市场节点。
</details>

<details>
<summary><strong>7. 大萧条</strong> · 标签 <code>大萧条</code> · 1929/10 — 1939</summary>

- **繁荣动力**：（本阶段无全面繁荣）1933–37 局部复苏。  
- **萧条/危机**：崩盘、银行挤兑、金本位、贸易崩溃、1937 二次衰退。  
- **Wikipedia**：[Great Depression in the U.S.](https://en.wikipedia.org/wiki/Great_Depression_in_the_United_States)  
- **事件范围**：新政 **主要立法与行政令**、银行假日、脱离金本位、1937 衰退、1939 欧战爆发（美未参战）等 **全部 CRITICAL/HIGH 节点**。
</details>

<details>
<summary><strong>8. 二战动员</strong> · 标签 <code>二战动员</code> · 1939 — 1945</summary>

- **繁荣动力**：国防工业、充分就业、技术扩散。  
- **萧条/危机**：配给、通胀管制、战后复员隐忧。  
- **Wikipedia**：[U.S. home front during WWII](https://en.wikipedia.org/wiki/United_States_home_front_during_World_War_II)  
- **事件范围**：租借法案、战时生产、价格管制、1944 布雷顿森林、1945 联合国等。
</details>

<details>
<summary><strong>9. 战后秩序与黄金年代</strong> · 标签 <code>战后黄金年代</code> · 1945 — 1973</summary>

- **繁荣动力**：布雷顿森林、婴儿潮、 suburban 建设、1960s 制造业巅峰。  
- **萧条/危机**：朝鲜/越南财政、1971 尼克松冲击、1973 石油危机。  
- **Wikipedia**：[Post–WWII economic expansion](https://en.wikipedia.org/wiki/Post%E2%80%93World_War_II_economic_expansion)  
- **事件范围**：马歇尔计划（对美外溢）、GI Bill、州际高速、民权与经济、越战财政、1971–73 货币/能源冲击等。
</details>

<details>
<summary><strong>10. 滞胀与沃尔克紧缩</strong> · 标签 <code>滞胀时代</code> · 1973 — 1982</summary>

- **繁荣动力**：能源州、国防工业等局部。  
- **萧条/危机**：石油冲击、双位通胀、1974–75/1980–82 衰退、沃尔克紧缩。  
- **Wikipedia**：[Stagflation in the U.S.](https://en.wikipedia.org/wiki/Stagflation_in_the_United_States)  
- **事件范围**：两次石油危机、1979 沃尔克、1980 货币控制法、1981 减税、1982 拉美债务危机等。
</details>

<details>
<summary><strong>11. 里根—克林顿长扩张</strong> · 标签 <code>新自由主义繁荣</code> · 1982 — 2000</summary>

- **繁荣动力**：降息、金融化、deregulation、IT、1990s 财政盈余、全球化。  
- **萧条/危机**：1987 股灾、S&amp;L、1998 LTCM、2000 dot-com。  
- **Wikipedia**：[Great Moderation](https://en.wikipedia.org/wiki/Great_Moderation)  
- **事件范围**：广场/卢浮宫协议、1987/1998 危机、NAFTA、1999 金融改革、2000 泡沫破裂等。
</details>

<details>
<summary><strong>12. 房地产泡沫与全球金融危机</strong> · 标签 <code>金融危机时代</code> · 2000 — 2009</summary>

- **繁荣动力**：2003–07 信贷与住房周期。  
- **萧条/危机**：9/11、次贷危机、2008 Lehman、大衰退。  
- **Wikipedia**：[2008 financial crisis](https://en.wikipedia.org/wiki/2008_financial_crisis)  
- **事件范围**：反恐战争财政、联储降息/QE 前奏、贝尔斯登/雷曼/AIG、TARP、2009 刺激法案等。
</details>

<details>
<summary><strong>13. 量化宽松与低利率</strong> · 标签 <code>QE时代</code> · 2009 — 2019</summary>

- **繁荣动力**：QE、零利率、科技巨头、页岩革命。  
- **萧条/危机**：2011 债务上限、2013 taper 恐慌、2015–16 制造业衰退。  
- **Wikipedia**：[Quantitative easing](https://en.wikipedia.org/wiki/Quantitative_easing)  
- **事件范围**：三轮 QE、taper、2015 加息正常化、2017 税改、贸易战关税等 **全部重大节点**。
</details>

<details>
<summary><strong>14. 疫情、财政刺激与通胀再抬头</strong> · 标签 <code>疫情后时代</code> · 2020 — 至今</summary>

- **繁荣动力**：2020–21 刺激、2021 复苏、2023– AI 投资。  
- **萧条/危机**：2020 Q2 断崖、2022– 通胀、快速加息、2023 区域银行压力。  
- **Wikipedia**：[COVID-19 economic impact (U.S.)](https://en.wikipedia.org/wiki/Economic_impact_of_the_COVID-19_pandemic_in_the_United_States)  
- **事件范围**：CARES/ARPA、通胀削减法、2022–23 加息、SVB、CHIPS/AI 政策等 **持续更新至当前年**。
</details>

---

## 三、数据模型（种子 JSON v2）

### 3.1 文件路径与外层结构

```json
{
  "version": 2,
  "description": "美国历史经济时代时间线（1776—今）",
  "timeline": {
    "country": "US",
    "anchorStart": "1776-07-04",
    "anchorEnd": "present"
  },
  "eras": [
    {
      "seedKey": "us-era-roaring-twenties",
      "tag": "咆哮二十年代",
      "title": "一战余波与柯立芝繁荣",
      "dateFrom": "1914-07-28",
      "dateTo": "1929-10-29",
      "cyclePhase": "繁荣",
      "defaultExpanded": false,
      "wikipediaUrl": "https://en.wikipedia.org/wiki/Roaring_Twenties",
      "eraSummary": "【繁荣动力】...\n【萧条/危机成因】...\n【制度与结构】...",
      "events": [ /* 见 3.3；条数不限 */ ]
    }
  ]
}
```

| 字段 | 要求 |
|------|------|
| `version` | 必须为 `2` |
| `eras[].seedKey` | 全局唯一，前缀 `us-era-` |
| `eras[].tag` | **阶段独立标签**（中文 2–8 字，全库唯一） |
| `eras[].cyclePhase` | `繁荣` \| `萧条` \| `转型` \| `战争动员` \| `混合` |
| `eras[].defaultExpanded` | 前 3 个时代 `true`，其余 `false` |
| `eras[].wikipediaUrl` | 阶段主 Wikipedia；无则 `null` |
| `eras[].eraSummary` | **必填**；须含「繁荣动力」「萧条/危机成因」两节（见 3.2） |
| `eras[].events` | **数组长度不限**；满足 1.1 收录标准即可 |

### 3.2 时代阶段正文模板（写入 `eraSummary`，并同步为阶段型 MarketEvent 的 `content`）

```markdown
【阶段概览】
（2–3 句：时间范围、在 American 宏观史中的位置）

【繁荣动力】
（列出 3–5 条：技术、人口、政策、贸易、金融条件、战争/外部需求等）

【萧条/危机成因】
（列出 3–5 条：泡沫、外部冲击、政策失误、结构失衡、战争/债务等；若阶段以萧条为主，写「萧条表现与传导机制」）

【制度与结构】
（货币制度、财政、监管、劳动力、贸易框架的变化）

【Wikipedia 延伸阅读】
（中文说明 + 链接，与 wikipediaUrl 一致或补充 1–2 条子主题）

[seed:us-era-xxx]
[era:tag:咆哮二十年代]
[era:phase:繁荣]
[era:collapse:foldable]
[era:dateFrom:1914-07-28]
[era:dateTo:1929-10-29]
```

### 3.3 阶段内事件（`eras[].events[]`）

每条事件 **除常规字段外**，正文末尾 **必须** 含父阶段引用：

```markdown
...正文...

[seed:us-1929-black-thursday]
[era:parent:us-era-roaring-twenties]
[era:tag:咆哮二十年代]
```

| 字段 | 类型 | 要求 |
|------|------|------|
| `seedKey` | string | 必填；前缀 `us-` + 年份或主题 slug |
| `title` | string | 15–40 字 |
| `content` | string | 必填；结构见 **3.4** |
| `occurredAt` | string | `YYYY-MM-DD` |
| `datePrecision` | `"DATE"` \| `"DATETIME"` | 默认 `DATE` |
| `importance` | enum | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `eventType` | string | `政策`、`央行决议`、`地缘`、`市场异动`、`监管`、`战争`、`条约`、`其他` |
| `countries` | string[] | 至少 `"US"` |
| `industries` | string[] | 可选 |
| `assets` | string[] | 可选；1970 年前可留空 |
| `macroKeys` | string[] | 可选 FRED 键 |
| `sourceUrl` | string \| null | **优先 Wikipedia 英文条目**；次选 Fed History、NBER、国会图书馆 |
| `isPublic` | boolean | 默认 `true` |

### 3.4 事件 `content` 正文结构

```markdown
【事件概述】
（2–4 句）

【历史背景】
（为何在此阶段发生；与阶段繁荣/萧条叙事的关系）

【主要影响】
（对美国实体经济、金融、就业、通胀/通缩、财政/货币的影响）

【宏观/市场关联】
（定性关联 FRED 指标或当时市场）

【Wikipedia】
（1 句 + 与 sourceUrl 一致的链接说明）

[seed:...]
[era:parent:us-era-xxx]
[era:tag:阶段标签]
```

---

## 四、入库流程（Agent 必须执行）

当前导入脚本仅识别 **扁平 `events`**。Agent 在写完 v2 JSON 后 **必须** 生成扁平数组并导入：

### 4.1 写入 v2 源文件

`scripts/data/market-events-us-history-eras.json`（含 `eras` 树，**完整穷尽版**）

### 4.2 扁平化规则

1. **每个时代阶段** → 1 条 `MarketEvent`：  
   - `eventType`: `"时代阶段"`  
   - `title`: `"{dateFrom 年}—{dateTo 年} {阶段名}"`（dateTo 为「今」则用当前年 12-31）  
   - `occurredAt`: `dateFrom`  
   - `importance`: `CRITICAL`  
   - `content`: `eraSummary`（含 `[era:collapse:foldable]` 等标记）  
   - `sourceUrl`: `wikipediaUrl`  
   - `industries`: `["时代阶段", "{tag}"]`

2. **每个子事件** → 1 条 `MarketEvent`：  
   - 正常字段 + `content` 内 `[era:parent:...]` 与 `[era:tag:...]`  
   - `industries` 追加阶段 `tag`

3. 合并为：

```json
{
  "version": 1,
  "description": "美国历史经济时代时间线（扁平导入）",
  "events": [ /* 阶段条目 + 全部子事件，按 occurredAt 升序 */ ]
}
```

写入：`scripts/data/market-events-us-history-timeline.json`

### 4.3 执行导入

```bash
npm run db:seed-market-events -- scripts/data/market-events-us-history-timeline.json
npm run db:seed-market-events -- scripts/data/market-events-us-history-timeline.json --dry-run
```

### 4.4 幂等与去重

- 阶段 `seedKey` 与事件 `seedKey` **不得重复**  
- 与旧种子文件（如 `market-events-us-1930-present.json`）重叠时 **沿用同一 seedKey** 或 skipped  
- 汇报 `created` / `skipped` / `errors`；`/events` 页按 `industries` 筛选阶段标签抽查

---

## 五、Wikipedia 链接规范

| 类型 | 规则 |
|------|------|
| 语言 | 优先 **英文** Wikipedia 稳定条目 URL |
| 阶段 | 宏观史总览条目 + 必要时子条目 |
| 事件 | 具体事件/法案/战争条目 |
| 验证 | 链接须可公开访问；404 则换官方史源或填 `null` |
| 正文 | 中文叙述；专有名词保留英文并括号标注 |

---

## 六、重要性与规模

| 层级 | 要求 |
|------|------|
| **时代阶段** | 12–16 条阶段头；`importance` 固定 `CRITICAL` |
| **阶段内事件** | **不设条数上限**；按 **§1.1** 穷尽收录 |
| **importance 分布** | 制度/战争/危机/核心立法 → `CRITICAL`/`HIGH`；次要但可验证节点 → `MEDIUM`/`LOW` |
| **排序** | 扁平 `events` 按 `occurredAt` **升序** |
| **规模预期** | 全库（含阶段头）通常 **数百条**；宁多勿漏，由研究员按史料补全 |

---

## 七、前端折叠展示约定（供后续 UI）

| 标记 | 含义 |
|------|------|
| `[era:collapse:foldable]` | 可折叠阶段头 |
| `[era:parent:us-era-xxx]` | 子事件归属阶段 |
| `[era:tag:中文标签]` | 阶段标签 |
| `eventType === "时代阶段"` | 时间线父节点 |

**交互**：默认展开 `defaultExpanded: true` 的阶段；点击折叠/展开子事件。

---

## 八、输出清单（Agent 交付）

1. **200–400 字总览**：美国从建国到今的宏观主线。  
2. **`market-events-us-history-eras.json`**：完整 v2 时代树（穷尽事件）。  
3. **`market-events-us-history-timeline.json`**：扁平 `version: 1` 导入文件。  
4. **执行 seed 命令**且 `errors=0`。  
5. **自检表**：

- [ ] 时间覆盖 **1776 — 当前年**，无空档  
- [ ] 每阶段含 **tag、eraSummary、wikipediaUrl**  
- [ ] **§1.1 各类重大事件已穷尽收录**（非仅示例条数）  
- [ ] 每事件含 **`[era:parent:...]`** 与 **sourceUrl（Wikipedia 或 null）**  
- [ ] 阶段型条目 `eventType=时代阶段`  
- [ ] `seedKey` 全局唯一；`errors=0`  

---

## 九、技术参考

| 项目 | 路径 |
|------|------|
| 本 Prompt | `.cursor/prompts/market-events-us-history-timeline.md` |
| v2 时代树 | `scripts/data/market-events-us-history-eras.json` |
| 扁平导入 | `scripts/data/market-events-us-history-timeline.json` |
| 导入命令 | `npm run db:seed-market-events` |
| 导入逻辑 | `src/lib/data/marketEventsImport.ts` |
| 数据模型 | `prisma/schema.prisma` → `MarketEvent` |
| 前端 | `/events`、宏观/行情「事件记录」侧栏 |

---

## 十、使用说明

将 **本 Prompt 全文** 交给 Agent：**历史经济学分析 → 穷尽编写 v2 时代树 → 扁平化 → seed 入库 → 汇报**。

**分批建议**：按时代阶段拆分（如每次 2–3 个 `eras`），每批合并进同一 v2/扁平文件，**seedKey 保持一致**。

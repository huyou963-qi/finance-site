# 个股基本面：终端级能力缺口与数据源拍板

本文对应评估路线 **阶段 C**。下列能力**尚未入库/上页**，需先选定数据源与成本后再开发。

## 现状摘要

| 已有 | 缺口 |
|------|------|
| SEC 标准化三表（~15 字段）+ TTM/估值/同业/事件 | 一致预期修订、Surprise、#analysts |
| Forward PE（FMP estimates，概览卡 + 行情叠加） | 分部收入/地区 |
| 13F → 因子层 | 个股页持股明细 / Form 4 内部人 |
| `ShortInterest` 表存在 | FINRA 源不可用 → 覆盖≈0 |

## 拍板项（产品 / 采购）

### 1. 一致预期

| 选项 | 覆盖 | 成本 | 备注 |
|------|------|------|------|
| A. 继续仅用 FMP `analyst-estimates` | 浅、免费档受限 | 低 | 已用于 Forward PE |
| B. 付费一致预期（FactSet / Refinitiv / Bloomberg） | 深、可修订历史 | 高 | 需合同与合规 |
| C. 暂缓 | — | — | 保持现状卡即可 |

**建议默认**：短期 A；若要做「预期驱动」研究再评 B。

### 2. 分部收入

| 选项 | 说明 |
|------|------|
| A. 解析 SEC segment XBRL（复杂、覆盖参差） | 工程量大 |
| B. 第三方 segment API | 成本 + 映射 |
| C. 暂缓 | 推荐直至有明确用例 |

### 3. Form 4 / 内部人

| 选项 | 说明 |
|------|------|
| A. SEC Form 4 RSS / EDGAR full-text | 可行但清洗重 |
| B. 第三方 insider feed | 成本 |
| C. 暂缓 | |

### 4. 空头

| 选项 | 说明 |
|------|------|
| A. 等 FINRA 或替代源恢复后接 `mds` ShortInterest | 表已预留 |
| B. 第三方 SI | 成本 |
| C. 暂缓 | 当前因子注册表亦未启用 SI |

### 5. 完整三表 / EBITDA

| 选项 | 说明 |
|------|------|
| A. 扩展 SEC tag 白名单（EBITDA、利息、流动资产等） | 可渐进，无额外采购 |
| B. 完整 as-reported 浏览 | 超出当前产品边界 |

**无采购也可先做的工程项**：在 `secFundamentals.ts` 增加 EBITDA / InterestExpense / CurrentAssets 等 tag 回退链，并扩展 snapshot 字段（需 Prisma migration，需协调）。

## 决策记录模板

```
日期：
决策人：
一致预期：A / B / C
分部：A / B / C
Form4：A / B / C
空头：A / B / C
报表扩维：A / B
备注：
```

拍板后在本文件追加「已决策」小节，再开 feature 分支实现。

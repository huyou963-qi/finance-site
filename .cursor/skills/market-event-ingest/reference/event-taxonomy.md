# Event taxonomy（以代码为准）

**单一事实来源**：[`src/lib/data/eventTaxonomy.ts`](../../../src/lib/data/eventTaxonomy.ts)

## scope

`COUNTRY` | `INDUSTRY` | `COMPANY` | `CROSS`

## eventType（点分）

```
policy.fiscal | policy.monetary | policy.regulatory | policy.trade
macro.release | macro.geopolitics | macro.disaster
company.earnings | company.guidance | company.corp_action
company.filing | company.ops_news | company.management
speech.official | speech.executive | speech.investor
rating.initiate | rating.upgrade | rating.downgrade | rating.maintain
price_target.change
market.anomaly | era | other
```

`company.earnings` / `company.filing` / `company.corp_action`（拆分）通常由 SEC `stockEvents` 提供，Skill **不要**再写。

## markerLabel

优先用类型默认缩略字（见 `EVENT_TYPE_MARKER_LABELS`），可覆盖为更贴切的 ≤4 字。

## importance 启发式

| 等级 | 示例 |
|------|------|
| CRITICAL | 战争爆发、系统性金融危机、重大央行体制变革 |
| HIGH | FOMC 利率决议、大型并购、重大监管落地、评级大幅调整 |
| MEDIUM | 常规政策微调、一般经营新闻、维持评级 |
| LOW | 次要会议、边际信息 |

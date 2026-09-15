# 日本跨境证券投资月度净额 Spec

## 范围

- 居民买卖海外股票及投资基金份额、海外债券净额。
- 非居民买卖日本股票及投资基金份额、日本债券净额。
- 共 4 条全国/跨境总量；债券合计中长期债和短期债，不接投资者部门、国别、币种或债券类型细分。

## 官方来源与符号

- 财务省发布页：<https://www.mof.go.jp/english/policy/international_policy/reference/itn_transactions_in_securities/index.htm>
- 月度滚动 CSV：`montha1.csv`，Shift-JIS，单位亿日元，2005-01 起。
- 该统计只覆盖财务大臣指定的主要金融机构，不等于完整 BOP 证券投资；优势是次月第六个工作日发布，较 BOP 早约一个月。
- 2014 年前历史发布版的居民对外净额符号展示与当前相反。接入不直接相信符号列，而是从同一行官方“取得－处置”统一计算：正值为净取得，负值为净处置，并校验发布净额。
- 2014-01 起股票项目加入投资基金份额，保留定义断点；不得把断点解释为纯股票资金突变。

## 更新机制

- `jp.mof.international_transactions_securities` 发布包；24 小时探测固定 CSV。
- 2026 年 9 月月报计划于 2026-10-08 08:50 JST 发布。
- `data:seed-jp-mof-securities-transactions`、`data:sync-jp-mof-securities-transactions`、`data:verify-jp-mof-securities-transactions -- --db`。

## 校验

- 表题、单位、列位置、2005-01 起点和月度连续性均有硬校验。
- 股票、中长期债、短期债的每个官方净额均与取得减处置交叉核对；目标债券净额由两个期限净额相加。

## 许可与署名

来源按日本政府 Public Data License 1.0 记录；展示需注明 `Source: Ministry of Finance Japan.`，中文名称仅为本站翻译。

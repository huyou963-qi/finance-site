# 日本国际投资头寸与对外债务 Spec

## 范围

- 季末对外资产总额、对外负债总额、净国际投资头寸、对外债务总额，共 4 条。
- 仅保留全国总量，不接工具、部门、期限、币种、地区或直接投资行业细分。

## 官方来源与断点

- 财务省发布页：<https://www.mof.go.jp/english/policy/international_policy/reference/iip/index.htm>
- IIP 季度估计滚动 XLS：`qiipm6.xls`；对外债务滚动 XLS：`edpm6.xls`。
- 单位十亿日元，季末存量，当前文件共同覆盖 2015Q1 至最新季度。
- 只保存 BPM6 季度估计，不与 2013 年末以前 BPM5 或 1996 年起年度 IIP 硬拼。
- 最新季度为一次估计，随后季度修订；年末季度会与正式年度 IIP 对齐。每次读取完整工作簿并保存修订版本。

## 更新机制

- `jp.mof.external_position` 发布包；72 小时探测两份官方 XLS。
- 下一次 IIP/外债季度估计计划于 2026-12-08 08:50 JST 发布。
- `data:seed-jp-mof-external-position`、`data:sync-jp-mof-external-position`、`data:verify-jp-mof-external-position -- --db`。

## 校验

- OLE/XLS 文件签名、sheet、英文列锚点、单位、季度连续性和共同覆盖面均为硬校验。
- 每个季度校验 `对外资产－对外负债≈净IIP`，仅容许官方四舍五入造成的 2 十亿日元误差。

## 许可与署名

来源按日本政府 Public Data License 1.0 记录；展示需注明 `Source: Ministry of Finance Japan.`，中文名称仅为本站翻译。

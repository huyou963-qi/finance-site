# 日本海关货物贸易总额 Spec

## 范围

- 仅接日本对世界的月度出口总额、进口总额和贸易差额，共 3 条。
- 不接地区、国家、HS 品目、行业、运输方式或税关维度。
- 出口和进口为海关官方名义未季调金额；贸易差额由同月出口减进口。

## 官方来源与口径

- 目录页：<https://www.customs.go.jp/toukei/suii/html/time_e.htm>
- 固定历史文件：<https://www.customs.go.jp/toukei/suii/html/data/d41ma.csv>
- 发布日历：<https://www.customs.go.jp/toukei/calendar/calend_e.htm>
- CSV 为 Shift-JIS、单位千日元、1979-01 起。入库换算为亿日元（除以 100,000）。
- 文件预置未来月份为 0，不是观测值；解析器只接受两列同时为零的尾部占位并将其剔除。
- 当年数据依次经历速報、确报、确々报及最终值；同步完整回读并依公共 vintage writer 留存修订。

## 更新机制

- `jp.customs.trade` 发布包；24 小时探测固定 CSV。
- 2026 年 8 月月度总额计划于 2026-09-16 08:50 JST 发布。
- `data:seed-jp-customs-trade`、`data:sync-jp-customs-trade`、`data:verify-jp-customs-trade -- --db`。

## 校验

- 表头、单位、1979-01 起点、月度连续性、未来零占位和单边零均有硬校验。
- 每期贸易差额恒等于出口减进口。

## 许可与署名

日本海关网站公开提供该 CSV；数据源记录官网使用条款和 `Source: Trade Statistics of Japan, Ministry of Finance.` 署名。中文名称仅为本站翻译。

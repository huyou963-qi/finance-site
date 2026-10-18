# 本地行情事件模板包

用自己的 AI 按 SKILL.md 与 Schema 生成 JSON。支持单标的里程碑与跨资产专题（政策、危机、AI 风险、财报催化等）。

1. 打开 /markets，选择任意资产，展开底部「事件筛选器」。
2. 导入范围选「按文件设置」（默认）或手动选「全部资产通用」/「仅当前标的」。
3. 点「导入本地事件」选择 JSON；查看导入结果提示，勾选「图上显示」。导入会开启文件包含的事件类型；如仍未显示，检查时间范围、重要性、文字筛选与「仅大预期差」。
4. 通用文件用 query.importTarget: "all-assets"，不需要 query.symbol 或 assets 白名单。切换资产、折叠事件栏或刷新页面后仍显示。

同一浏览器站点、当前账号内有效；不会上传数据库、不会跨浏览器或跨域名同步。导入按 externalId 更新并保留同范围其他事件；重复导入不会复制。单标的同 ID 版本优先。可点「清除通用事件」清除全部通用集合，再导入文件恢复。

旧文件无 importTarget 时仍只保存到当前标的。example-TSLA.json 是旧格式形状示例，事实应自行核实。

文件：README.md、SKILL.md、ingest-output.schema.json、example-TSLA.json。下载 company-milestone-pack.zip；修改后运行 npm run pack:company-milestone 重建。

私人专题可引用财报作为催化剂；共享库仍须管理员按 market-event-ingest 规则单独去重、审核和入库。本地 JSON 的 all-assets 不表示有发布到共享库的授权。

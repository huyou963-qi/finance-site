# 日本内阁府景气观察者调查：官方 Excel 数据接入

状态：`production-ready`

## 1. 范围和复用结论

本批接入内阁府《景气观察者调查》全国分野别季节调整值，保留现状判断与先行判断的总合、家计动向、企业动向、雇用相关四个官方 DI，共 8 条月频基础序列。仓库检索未发现同口径 Instrument、provider 或可扩展 adapter；ESRI GDP、BOJ 短观和其他信心指标均不是该调查，不能替代。

本批不接原数值、地区、细行业、回答人数/构成比或判断理由文本。季调工作簿虽然所在页面标为“2001年-2026年”，其可比季调时序实际始于 2002-01；不得用另一份原数值表补接 2001 年。

## 2. 指标目录

| code 前缀/组合 | 指标 | 数量 | 单位 | 历史 | 2026-09-13 实测最新 |
|---|---|---:|---|---|---|
| `cao_jp_watchers_current_{total,household,corporate,employment}_di_sa` | 现状判断方向性 DI | 4 | DI | 2002-01 | 2026-08 |
| `cao_jp_watchers_outlook_{total,household,corporate,employment}_di_sa` | 先行判断方向性 DI | 4 | DI | 2002-01 | 2026-08 |

每条 296 个连续月度观测，8 条共 2,368 个观测。DI 的中性基准为 50；数据库只保存官方 DI，不另存阈值差、环比等派生序列。

## 3. 官方来源、合规与请求控制

- 官方长期表页：<https://www5.cao.go.jp/keizai3/watcher.html>
- 季调工作簿：<https://www5.cao.go.jp/keizai3/watcher/watcher5.xls>
- 官方公表予定：<https://www5.cao.go.jp/keizai3/watcher/watcher-yotei.html>
- 内阁府利用规则：<https://www.cao.go.jp/notice/rule.html>
- 2026-09-13 文件：305,664 bytes，OLE/BIFF Excel，SHA-256 `EB6D0B440E2F4FAB0CF34225B6568D9E5494175885D27231680026861C131614`。

`www5.cao.go.jp/robots.txt` 在实测时返回内阁府 404 页面，没有该 origin 的机器人禁抓声明。内阁府利用规则采用公共数据利用规约，允许复制、公开传输、翻译、修改及商业使用，但要求来源标注；数值和简单表格数据可自由使用。本实现保留官方 attribution 与利用规则 URL。

生产每轮先访问一个公开目录 HTML，以精确锚点唯一发现 `watcher5.xls`，再下载一个工作簿；所有 8 条序列共享 60 秒缓存。请求串行、两次请求至少相隔 5 秒、30 秒超时，无并发、无认证、无访问控制规避。工作簿按 SHA-256 保存到 `.data/jp-cao-economy-watchers/snapshots/`。

## 4. 解析、防御和修订语义

工作簿固定包含“分野別（現状）”和“分野別（先行き)”页；解析器逐页验证调查方向、季调范围、总合/家计/企业/雇用表头、年份与月份、0–100 值域、月度连续性和全序列相同覆盖区间。缺页、链接重复、表头变更、未知文本标记、重复或跳月、未来月份、异常 DI 或历史截断均抛错，不写入可疑值。

内阁府明确说明每年重新计算季节调整值，既往月份会追溯修订，公表时数值可能不同于当前长期表。adapter 每次返回 2002 年以来完整历史，由 canonical writer 跳过未变值并将新值和修订值写入版本账本。该版本账本只能证明本站实际抓取时点所见，不是历史首发 PIT。

## 5. 订阅、官方发布和目录

- 数据源：`jp-cao-economy-watchers`；provider：`jp_cao_economy_watchers`。
- 发布包建议：`jp.cao.economy_watchers`，成员 `cao_jp_watchers_*`，月频，8 条同源同批。
- 当前安全调度：`probe_interval=24h`。官方已有稳定公表予定页，但项目的 `economic_calendar` 尚不支持内阁府 provider；在增加官方日历解析前不回退 TradingEconomics。
- 2026-09-01 公表予定页列出的下一次发布：2026-10-08 14:00 JST（2026年9月调查），随后为 2026-11-10 14:00 JST。予定可变，生产应以后续页面解析结果为准。
- 目录：日本 → 国民经济 → 景气调查 → 月频。metadata 已设置 `catalogCategory=国民经济`、`catalogSubgroup=景气调查`；全局 taxonomy 需补 `cao_jp_watchers_` 的显式映射。

## 6. 交付检查

- [x] 全仓查重与口径边界
- [x] 官方页面、静态 Excel、robots 与利用规则实测
- [x] 精确文件发现、5 秒限速、30 秒超时、OLE 魔数和 SHA-256 快照
- [x] 8 条全国季调序列 catalog、parser、fixture 与失败关闭测试
- [x] adapter、seed、sync、verify 与完整历史修订回读
- [x] live 工作簿解析验证
- [ ] 主任务集成 package.json、seed/verify registry、release package、worker dispatcher 与 taxonomy
- [x] 主任务完成 seed/sync、目录布局、发布包与 DB 验证
- [ ] 香港生产部署及抽查

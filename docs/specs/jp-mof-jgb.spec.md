# 日本财务省国债固定期限收益率

## 范围与复用门

2026-09-09 核验，2026-09-10 执行。15 个官方期限：1–10、15、20、25、30、40 年。
已有 `jpov_c07_jgb_2y` 的 12,863 条及 `jpov_c06_jgb_10y` 的 9,863 条逐日与官方历史 CSV 对比，全部同值、无缺日，保留原 Instrument 与历史，更新其唯一订阅；13 个其余期限为新事实。原有10年减2年利差是派生指标，本批不重建计算链。

## 来源与许可

- [官方入口](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm)直接链接 current 与 historical CSV。
- [口径说明](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/qa.htm)：固定期限、半年复利、参考交易日收市价格计算，次一营业日09:30日本时间发布；不同于单只国债报价。
- [使用条款](https://www.mof.go.jp/english/about_mof/notice/index.html)：PDL 1.0，保留日本财务省来源说明。
- robots.txt 实测404，官方公开静态下载，无登录与访问控制绕过。
- `.data/japan-onboarding/jgb-{all,current}.csv` 为开发前真实fixture；运行快照在 `.data/japan-mof-jgb/`，保留原始字节、SHA256、URL、抓取时刻与解析器版本。

## 目录、订阅与修订

- 日本 → 利率与信用市场 → 国债收益率曲线（日频），15条，单位%。
- `sourceId=japan-mof-jgb`，共享 `jp.mof.jgb_yields` 发布包，24小时probe，时区Asia/Tokyo。未实现营业日09:30精确触发，最迟在下一次probe捕获。
- 两份文件顺序请求、间隔至少1.2秒、30秒超时、全曲线共享60秒缓存；失败交统一worker backoff。
- 历史文件止于上月，current补本月；按交易日期合并，缺失`-`不填0、不延展非交易日；允许负收益率。
- `revisionLookback=700`月保留既有历史修订窗口。统一`runDataSubscription`、`upsertMacroObservations`及其原子vintage writer；版本可见时间是实际抓取时刻，不能当作历史首发PIT。
- 首次迁移旧源必须全历史对账；已是该官方源时seed只幂等维护定义，不因正常官方修订阻塞部署。

## 验证

`npx tsx --test src/lib/data/scheduler/japanMofJgb/parser.test.ts`：负利率、缺失期限、列名变化、空值、非法日期、重复/未来日期。

`data:seed-japan-mof-jgb -- --dry-run` → `data:seed-japan-mof-jgb` → `data:seed-release-packages` → `data:sync-japan-mof-jgb` → `data:verify-japan-mof-jgb -- --db`。

逐条最终观测范围与执行结果见 `docs/research/JAPAN_DATA_ONBOARDING_PROGRESS.md`；本Spec不把未执行的验证写成通过。

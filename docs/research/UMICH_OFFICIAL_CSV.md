# 密歇根消费者信心官方 CSV

2026-10-22：所有者明确确认已取得授权。授权文件/凭据不存仓库。

## 获取与存储

- 主源：https://www.sca.isr.umich.edu/files/tbcics.csv
- 历史核对：https://www.sca.isr.umich.edu/files/tbmics.csv
- 当前表实测包含 September 2026=48.1（终值）、October (P) 2026=46.3（初值）。补9月无需手写数字。
- 保留原 Instrument 和 fred:UMCSENT 图表 alias；采集来源改为 umich-official-csv，不再等待 FRED 延迟镜像。
- 现有 scheduler/writer 负责幂等与版本；fetch_run.sourceMetadata.preliminaryPeriods 记录初值月份，终值无(P)。不把抓取时刻伪装为官方发布时间；历史首发时点不倒填。
- 当前 CSV 含有限历史，每次全读并按24个月修订窗口写入。旧 FRED 历史保留，不删除、不重写全部历史。
- HTTP/格式失败明确报错，不回退到过时镜像冒充成功；不访问登录区、不绕过保护。

## 调度与发布时间

发布包 us.umich.sentiment 改为每小时 probe；这不是精确官方日历触发。worker正常每5分钟执行时，发布后通常1小时加一个worker周期内获取，网络失败除外。不能承诺发布秒级入库。

官方初值和终值均纽约当地10:00发布，须按 America/New_York 换算，不能全年固定北京时间22:00。

官方2026年历：https://data.sca.isr.umich.edu/fetchdoc.php?docid=79628

| 期次 | 北京时间 |
|---|---|
| 2026-10终值 | 10月23日22:00 |
| 2026-11初值/终值 | 11月6日/20日23:00 |
| 2026-12初值/终值 | 12月4日/18日23:00 |

部署后由定义seed迁移来源，再刷新发布包定义；既有启用状态及nextRunAt不在迁移seed中强制重置。补缺使用worker lock下的现有runDataSubscription并preserveNextRunAt，确认9月48.1及10月初值46.3。生产尚未部署前不得报告已经补齐。

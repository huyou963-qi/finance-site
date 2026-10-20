# Manheim 二手车批发价格指数

**目录**：美国 → 通胀与价格 → 二手车批发价格。唯一序列 `mds:cox_us_manheim_used_vehicle_value_index_sa`，月频、季调、基期 **1997 年 1 月 = 100**。入库观测日规范为月份首日；官方文件按月标记（历史 Wind 文件原表日期为月末）。指数反映批发二手车价格，经车型结构、里程和季节调整；与 CPI 二手车零售分项口径不同。

**数据来源**：Cox Automotive [Manheim 正式月报列表](https://www.coxautoinc.com/insights/?insight_series=manheim-used-vehicle-index)的「Download the Data」官方 XLSX。文件 `DATA` 表包含 1997-01 起完整月度历史和未四舍五入的季调指数；入库保留小数点后 10 位，避免浮点序列化差异导致每次探测都误记修订。2026-10-03 核对官方 2026-08 原值 208.17754455012556，与用户授权 Wind 导出的同月值一致。Wind XLSX（`MANHEIM_MUVVI_FILE`）只在空库首次 seed 时作为可选历史回填；正常增量不依赖本地文件。Cox 在 2023 年把基期调整为 1997-01=100，旧 1995 基期版本不能直接拼接。

**发布与更新**：Cox [官方发布日历](https://www.coxautoinc.com/wp-content/uploads/2025/12/2026-Manheim-Used-Vehicle-Value-Index-Release-Dates.pdf)列出每月正式指数发布日，通常是次月第 5 个工作日。月中检查点不是正式值，不写入本序列。`data:worker` 通过 `us.cox.manheim_muvvi` 发布包每 24 小时探测月报列表，只选择标题为「Manheim Used Vehicle Value Index: <月份> <年份> Trends」的正式报告，下载报告内 XLSX；核对文件最新月与报告月份一致，再按修订窗口写库并留版本。下载失败则记录 fetch run 失败并重试，不用月中值或旧 Wind 文件冒充新值。不得将授权 Wind 文件提交到 Git 或放入公开静态目录。

**命令**：`data:seed-manheim-muvvi`（定义和官网全历史回填）、`data:seed-release-packages`（关联发布包）、`data:sync-manheim-muvvi`（按 worker 强制同步）、`data:verify-manheim-muvvi -- --db`（官网文件、口径、目录、订阅和最新观测自检）。解析器拒绝月份重复/缺口、非正值、基期错误及报告与文件月份不一致。数据库版本账本记录后续真实修订。

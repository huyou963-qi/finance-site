# Manheim 二手车批发价格指数

**目录**：美国 → 通胀与价格 → 二手车批发价格。唯一序列 `mds:cox_us_manheim_used_vehicle_value_index_sa`，月频、季调、基期 **1997 年 1 月 = 100**。入库观测日规范为月份首日；授权文件原表日期为月末。指数反映批发二手车价格，经车型结构、里程和季节调整；与 CPI 二手车零售分项口径不同。

**数据来源**：当前由用户确认授权的本地 Wind XLSX 导出，文件标题为 `US: Manheim Wholesale Value Index: Used Vehicle: SA`，底部标注 Wind。底层指数由 Cox Automotive / Manheim 发布。接入只读取本地授权文件，**不从 Cox 网站抓取或下载历史数据**。2026-09-24 验证该文件含 1997-01 至 2026-08 共 356 个连续月度值，最新值 208.177545，源文件标注更新时间 2026-09-08。Cox 在 2023 年把基期调整为 1997-01=100，旧 1995 基期版本不能直接拼接。

**发布与更新**：Cox [官方发布日历](https://www.coxautoinc.com/wp-content/uploads/2025/12/2026-Manheim-Used-Vehicle-Value-Index-Release-Dates.pdf)列出每月正式指数发布日，通常是次月第 5 个工作日。月中检查点不是正式值，不写入本序列。将每月更新后的授权 XLSX 覆盖 `MANHEIM_MUVVI_FILE` 指向的绝对路径；`data:worker` 通过 `us.cox.manheim_muvvi` 发布包与 24 小时 `probe_interval` 检查本地文件，完整回读历史以捕获修订。文件不在部署环境时，seed 保留序列定义但禁用订阅；部署环境须单独配置授权文件和路径。不得将授权文件提交到 Git 或放入公开静态目录。

**命令**：`data:seed-manheim-muvvi`（定义和回填）、`data:seed-release-packages`（关联发布包）、`data:sync-manheim-muvvi`（按 worker 强制同步）、`data:verify-manheim-muvvi -- --db`（文件、口径、目录、订阅和逐月观测自检）。解析器拒绝标题不符、月份重复/缺口、非正值、基期错误及发布时间早于观测月份。数据库版本账本记录后续真实修订。

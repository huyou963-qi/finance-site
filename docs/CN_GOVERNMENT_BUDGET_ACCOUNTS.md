# 中国政府第三、第四本账与财政月报更新

本域只保存财政部直接公开的原始金额。第三本账为国有资本经营预算，第四本账为社会保险基金预算；与既有前两账月报独立，不把年度决算、年内累计、预算数混拼。

## 官方来源与覆盖

- 财政部预算司：<https://yss.mof.gov.cn/>，逐年全国财政决算公开表。
- 2018年归档为 `2018czjs/`，2019年为 `2019qgczjs/` 且目录有分页，2020年起为 `YYYYzyjs/`。最新年度从预算司首页公开链接发现。
- 每年度应有全国、中央、地方 × 国资收入/国资支出/社保收入/社保支出/社保结余，共15类表；缺表、决算列不明、同名行无法区分、单位异常一律失败，不误记成无新值。
- 历史先以可完整解析的2018年起，不拼接未经核验的早期格式。
- 固定候选catalog只注册官方历史确有金额的序列。最新同范围同表未再公布金额的项保留历史、暂停独立订阅，防止停列项目常年报滞后。
- 新环境离线定义模式会先启用尚无观测的历史项，worker取到历史后自动暂停；不会将空历史项直接永久禁用。
- 年频，亿元，年度存当年1月1日。只取“决算数”列，不取“预算数”“决算数为预算数的%”。负结余、冲减支出的负数原样保留；空白不等于0。

## 口径与平衡

- 全国、中央、地方不能不加调整就简单相加；社会保险全国统筹调剂有单独利息和收支。
- “收入小计/合计/总计”可能分别包含调入资金、上级补助及统筹调剂，须使用对应原始指标核对收支。
- 2020年全国社保另有500亿元调入资金；收入合计不含这笔钱，核对收支结余时需用收入总计。
- 2025年中央部分行业统筹单位转入地方，中央统计范围改变；中央社保本年结余与全国统筹结余分别披露。
- 生育保险与医保按当年原表分列或合并，不造连续生育序列，不用当前口径重算历史。
- 非官方计算的同比、支出进度、财政补贴依赖、合并四本账等在分析层完成；本域不保存这些派生结果。
- 版本账本证明本次抓取可见时间，不将本次回填误称历史首发PIT。

## 更新机制

| 域 | Source / provider | 发布包 | 调度 |
|---|---|---|---|
| 原两本账财政月报 | `mof-fiscal` / `mof_fiscal` | `cn.mof.fiscal` | 官方归档24h探测，36个月修订窗口；空库完整回填 |
| 国资、社保年度决算 | `mof-budget-accounts` / `mof_budget_accounts` | `cn.mof.budget_accounts_final` | 168h探测，完整重读官方历史 |

年度模块以共享promise合并并发请求，单请求30秒超时、串行限速；24小时HTTP磁盘缓存放在 `.data/mof-budget-accounts/`，包含URL、抓取时间与原文。`MOF_BUDGET_BYPASS_CACHE=1` 可绕过磁盘缓存进行联网核验；HTTP失败不写磁盘，同批成员共享失败结果并各自记FAILED/退避，避免一次源站故障放大为上百次重试。源目录发现新年度后自动纳入，不需要每年改最新年份。

自动与手动同步都经过 `fetchSubscriptionIncremental` → provider adapter → `runDataSubscription` → 通用观测/版本writer。无新增或修订记为SKIPPED、刷新lastSuccessAt和nextRunAt；源站/解析错误记FAILED并独立退避。

probe包成员独立排期。包nextRunAt仅聚合启用成员最早到期时间，不能由首个成员把其他成员推迟。经济日历包保留原有共享日程行为。从旧TE财政日历包迁移为probe时，seed清除旧日历证明和过期包排期。

## 命令

```powershell
npm run data:seed -- --catalog=mof-budget-accounts
# 更新git中的可用指标证据快照；只在官方核验后执行并随代码提交
npm run data:seed-mof-budget-accounts -- --write-catalog
# 快速部署：不访问官网、不写历史观测
npm run data:seed-mof-budget-accounts -- --definitions-only
npm run data:seed-mof-fiscal
npm run data:seed-release-packages
npm run data:sync-mof-fiscal
npm run data:repair-mof-fiscal-periods -- --dry-run
npm run data:repair-mof-fiscal-periods -- --apply
npm run data:sync-mof-budget-accounts

# 真正到期路径：不加 --force，处理到期包成员；重复运行应无到期订阅
npm run data:worker -- --source=mof-fiscal --limit=1
npm run data:worker -- --source=mof-budget-accounts --limit=1

npm run data:verify-mof-fiscal -- --db --live --require-worker
npm run data:verify-mof-budget-accounts -- --db --live --scheduler
npm run data:rebuild-global-catalog-layout -- --dry-run
npm run data:rebuild-global-catalog-layout
```

live seed先核验真实官方历史，再幂等建立指标与订阅、通过通用writer填历史；不会重置已有订阅nextRunAt。`--definitions-only`使用git里的 `data/mof-budget-accounts-availability.json` 官方证据快照，只注册真实存在的定义，保留核验日期，不伪装成当次联网确认。

正式部署由统一 `data:apply` 的registry覆盖；`--skip-backfill`时年度域传入 `--definitions-only`，首次新库由worker读取官方历史。完整维护模式则执行原财政全历史回填及有证据的错期间修复；使用 `--only=mof-fiscal` 时也纳入这两步，`--skip-backfill`不执行。无需schema migration。

目录：CN → 财政与公共债务 → 国资预算（全国/中央/地方）、社保基金（地域×总量/养老/医疗与生育/工伤与失业），年频叶组≤48。落点由taxonomy与持久化布局同步完成。

## 既有财政修复

- 2022年留抵退税：金额与自然口径同比分别解析，不能用扣除退税因素后的增速冒充金额同比。
- 旧版预算完成率、绝对增加额、政府性基金旧名称、增长若干倍等文案兼容；当月段落与年内累计段落区分。
- 历史只给当月值时不能塞入累计序列；对已有污染仅按原文证据审计修正，不因解析不到就删数据。
- 错误子项别名（其他税收误当税收总额、地方非税误当全国、行业企业所得税误当总项）也需匹配明确原文标签和旧值后清理。修复前先写 `.data/audits/` JSON备份和来源证据，再在事务中按ID、日期、金额比较后删除误值；保留指标、订阅和版本账本。无法核实的值不静默删除。
- 全量回填脚本不再删除任何Instrument；解析失败必须暴露，不以“跳过历史页”掩盖抓取失败。

## 环境定时触发的边界

worker试跑证明的是数据库到期选取、分发、取数、写库、日志与排期链路。周期性触发还依赖运行环境。

仓库生产部署负责安装 `scripts/ops/finance-site-data-scheduler.cron` 并同步独立cron源码检出，worker每5分钟、日历每小时，无source过滤。本次本地检查未发现Windows项目计划任务；未登录生产服务器，不能据此声称生产cron已实际运行。发布后应核查生产 `scheduler_invocation`、`fetch_run` 和cron日志，确认实际调用持续发生。

验收数值与执行结果见 `docs/research/CN_GOVERNMENT_BUDGET_ACCOUNTS_ACCEPTANCE_2026-10-21.md`。

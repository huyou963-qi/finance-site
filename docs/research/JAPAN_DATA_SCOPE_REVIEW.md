# 日本宏观数据范围精简评估

评估日期：2026-09-14。范围依据为官方数据接入代码、香港生产审计和 `JAPAN_OFFICIAL_DATA_SOURCE_RESEARCH.md`。

## 建议结论

初始生产库有 **177 条**日本官方序列。已物理下线 **79 条**细分序列：同步删除其订阅、观测、版本账本、发布包成员和目录位置，并写入退役账本，防止后续 seed 重新创建。后续接入 **51 条**全国或部门总量序列，优化后的核心目录目标为 **149 条**。

过滤规则：不接都道府县/城市数据；不接大规模行业、品目、国别和人口属性交叉表；同一统计只保留总量、关键传导分项和市场基准；可由基础水平可靠计算的同比、占比和重复频率不重复落库。

东京CPI是全国CPI的领先信号，但仍属地区数据。严格执行本规则时删除13条；如希望保留提前约三周的通胀信号，可只保留东京总项、除生鲜、除生鲜及能源3条，则核心数为101条。

## 当前已入库与处理建议

| 数据域 | 已入库 | 建议保留 | 建议隐藏 |
|---|---:|---:|---:|
| MOF国债收益率 | 15 | 6 | 9 |
| BOJ宏观 | 9 | 9 | 0 |
| METI工业生产 | 4 | 4 | 0 |
| ESRI GDP | 41 | 20 | 21 |
| CPI | 26 | 13 | 13 |
| 劳动力调查 | 12 | 4 | 8 |
| 家计调查 | 4 | 4 | 0 |
| MHLW工资工时 | 6 | 6 | 0 |
| 消费者信心 | 5 | 5 | 0 |
| 国际收支 | 8 | 8 | 0 |
| 景气观察者 | 8 | 2 | 6 |
| 零售销售 | 10 | 5 | 5 |
| 机械订单 | 13 | 5 | 8 |
| 外汇储备 | 10 | 6 | 4 |
| 访日外客 | 6 | 1 | 5 |
| **合计** | **177** | **98** | **79** |

下面列出初始已入库指标；“保留”表示继续订阅，“隐藏”表示已物理退役并不再入目录。

### MOF国债收益率（15）

| 处理 | 指标 | code |
|---|---|---|
| 隐藏 | 日本：国债固定期限收益率：1年 | `mof_jp_jgb_1y` |
| 保留 | 日本：国债固定期限收益率：2年 | `jpov_c07_jgb_2y` |
| 隐藏 | 日本：国债固定期限收益率：3年 | `mof_jp_jgb_3y` |
| 隐藏 | 日本：国债固定期限收益率：4年 | `mof_jp_jgb_4y` |
| 保留 | 日本：国债固定期限收益率：5年 | `mof_jp_jgb_5y` |
| 隐藏 | 日本：国债固定期限收益率：6年 | `mof_jp_jgb_6y` |
| 隐藏 | 日本：国债固定期限收益率：7年 | `mof_jp_jgb_7y` |
| 隐藏 | 日本：国债固定期限收益率：8年 | `mof_jp_jgb_8y` |
| 隐藏 | 日本：国债固定期限收益率：9年 | `mof_jp_jgb_9y` |
| 保留 | 日本：国债固定期限收益率：10年 | `jpov_c06_jgb_10y` |
| 隐藏 | 日本：国债固定期限收益率：15年 | `mof_jp_jgb_15y` |
| 保留 | 日本：国债固定期限收益率：20年 | `mof_jp_jgb_20y` |
| 隐藏 | 日本：国债固定期限收益率：25年 | `mof_jp_jgb_25y` |
| 保留 | 日本：国债固定期限收益率：30年 | `mof_jp_jgb_30y` |
| 保留 | 日本：国债固定期限收益率：40年 | `mof_jp_jgb_40y` |

### BOJ宏观（9）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | M2货币存量：月平均余额 | `boj_jp_m2` |
| 保留 | M3货币存量：月平均余额 | `boj_jp_m3` |
| 保留 | M1货币存量：月平均余额 | `boj_jp_m1` |
| 保留 | 货币基础：月平均余额 | `boj_jp_monetary_base` |
| 保留 | 国内企业商品价格指数：总项 | `boj_jp_cgpi` |
| 保留 | 服务业生产者价格指数：总项 | `boj_jp_sppi` |
| 保留 | 主要银行、地方银行及信用金库贷款与贴现余额 | `boj_jp_bank_loans` |
| 保留 | 短观：大型制造业景气判断DI（实际） | `boj_jp_tankan_large_mfg` |
| 保留 | 短观：大型非制造业景气判断DI（实际） | `boj_jp_tankan_large_nonmfg` |

### METI工业生产（4）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：工业生产指数（季调） | `meti_jp_iip_production_sa` |
| 保留 | 日本：工业出货指数（季调） | `meti_jp_iip_shipments_sa` |
| 保留 | 日本：工业库存指数（季调） | `meti_jp_iip_inventories_sa` |
| 保留 | 日本：工业库存率指数（季调） | `meti_jp_iip_inventory_ratio_sa` |

### ESRI GDP（41）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本:GDP:名义季调年率 | `esri_jp_gdp_gdp_nominal_saar` |
| 隐藏 | 日本:私人最终消费:名义季调年率 | `esri_jp_gdp_private_consumption_nominal_saar` |
| 隐藏 | 日本:私人住宅投资:名义季调年率 | `esri_jp_gdp_private_residential_nominal_saar` |
| 隐藏 | 日本:私人非住宅投资:名义季调年率 | `esri_jp_gdp_private_business_nominal_saar` |
| 隐藏 | 日本:私人库存变动:名义季调年率 | `esri_jp_gdp_private_inventories_nominal_saar` |
| 隐藏 | 日本:政府最终消费:名义季调年率 | `esri_jp_gdp_government_consumption_nominal_saar` |
| 隐藏 | 日本:公共固定资本形成:名义季调年率 | `esri_jp_gdp_public_investment_nominal_saar` |
| 隐藏 | 日本:公共库存变动:名义季调年率 | `esri_jp_gdp_public_inventories_nominal_saar` |
| 隐藏 | 日本:货物与服务净出口:名义季调年率 | `esri_jp_gdp_net_exports_nominal_saar` |
| 隐藏 | 日本:货物与服务出口:名义季调年率 | `esri_jp_gdp_exports_nominal_saar` |
| 隐藏 | 日本:货物与服务进口:名义季调年率 | `esri_jp_gdp_imports_nominal_saar` |
| 保留 | 日本:GDP:实际季调年率（2020年链式价格） | `esri_jp_gdp_gdp_real_saar` |
| 保留 | 日本:私人最终消费:实际季调年率（2020年链式价格） | `esri_jp_gdp_private_consumption_real_saar` |
| 保留 | 日本:私人住宅投资:实际季调年率（2020年链式价格） | `esri_jp_gdp_private_residential_real_saar` |
| 保留 | 日本:私人非住宅投资:实际季调年率（2020年链式价格） | `esri_jp_gdp_private_business_real_saar` |
| 隐藏 | 日本:私人库存变动:实际季调年率（2020年链式价格） | `esri_jp_gdp_private_inventories_real_saar` |
| 保留 | 日本:政府最终消费:实际季调年率（2020年链式价格） | `esri_jp_gdp_government_consumption_real_saar` |
| 保留 | 日本:公共固定资本形成:实际季调年率（2020年链式价格） | `esri_jp_gdp_public_investment_real_saar` |
| 隐藏 | 日本:公共库存变动:实际季调年率（2020年链式价格） | `esri_jp_gdp_public_inventories_real_saar` |
| 隐藏 | 日本:货物与服务净出口:实际季调年率（2020年链式价格） | `esri_jp_gdp_net_exports_real_saar` |
| 保留 | 日本:货物与服务出口:实际季调年率（2020年链式价格） | `esri_jp_gdp_exports_real_saar` |
| 保留 | 日本:货物与服务进口:实际季调年率（2020年链式价格） | `esri_jp_gdp_imports_real_saar` |
| 保留 | 日本:GDP:季调平减指数 | `esri_jp_gdp_gdp_deflator_sa` |
| 保留 | 日本:私人最终消费:季调平减指数 | `esri_jp_gdp_private_consumption_deflator_sa` |
| 隐藏 | 日本:私人住宅投资:季调平减指数 | `esri_jp_gdp_private_residential_deflator_sa` |
| 隐藏 | 日本:私人非住宅投资:季调平减指数 | `esri_jp_gdp_private_business_deflator_sa` |
| 隐藏 | 日本:政府最终消费:季调平减指数 | `esri_jp_gdp_government_consumption_deflator_sa` |
| 隐藏 | 日本:公共固定资本形成:季调平减指数 | `esri_jp_gdp_public_investment_deflator_sa` |
| 保留 | 日本:货物与服务出口:季调平减指数 | `esri_jp_gdp_exports_deflator_sa` |
| 保留 | 日本:货物与服务进口:季调平减指数 | `esri_jp_gdp_imports_deflator_sa` |
| 保留 | 日本:GDP:实际季调环比 | `esri_jp_gdp_gdp_real_qoq_sa` |
| 保留 | 日本:私人最终消费:对实际GDP环比贡献（季调） | `esri_jp_gdp_private_consumption_real_contribution_sa` |
| 隐藏 | 日本:私人住宅投资:对实际GDP环比贡献（季调） | `esri_jp_gdp_private_residential_real_contribution_sa` |
| 保留 | 日本:私人非住宅投资:对实际GDP环比贡献（季调） | `esri_jp_gdp_private_business_real_contribution_sa` |
| 保留 | 日本:私人库存变动:对实际GDP环比贡献（季调） | `esri_jp_gdp_private_inventories_real_contribution_sa` |
| 保留 | 日本:政府最终消费:对实际GDP环比贡献（季调） | `esri_jp_gdp_government_consumption_real_contribution_sa` |
| 保留 | 日本:公共固定资本形成:对实际GDP环比贡献（季调） | `esri_jp_gdp_public_investment_real_contribution_sa` |
| 隐藏 | 日本:公共库存变动:对实际GDP环比贡献（季调） | `esri_jp_gdp_public_inventories_real_contribution_sa` |
| 保留 | 日本:货物与服务净出口:对实际GDP环比贡献（季调） | `esri_jp_gdp_net_exports_real_contribution_sa` |
| 隐藏 | 日本:货物与服务出口:对实际GDP环比贡献（季调） | `esri_jp_gdp_exports_real_contribution_sa` |
| 隐藏 | 日本:货物与服务进口:对实际GDP环比贡献（季调） | `esri_jp_gdp_imports_real_contribution_sa` |

### CPI（26）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：CPI：全国：总项（2025=100） | `jp_estat_cpi_2025_national_all` |
| 保留 | 日本：CPI：全国：除生鲜食品（2025=100） | `jp_estat_cpi_2025_national_ex_fresh` |
| 保留 | 日本：CPI：全国：除生鲜食品及能源（2025=100） | `jp_estat_cpi_2025_national_ex_fresh_energy` |
| 保留 | 日本：CPI：全国：食品（2025=100） | `jp_estat_cpi_2025_national_food` |
| 保留 | 日本：CPI：全国：居住（2025=100） | `jp_estat_cpi_2025_national_housing` |
| 保留 | 日本：CPI：全国：水电燃气（2025=100） | `jp_estat_cpi_2025_national_utilities` |
| 保留 | 日本：CPI：全国：家具及家务用品（2025=100） | `jp_estat_cpi_2025_national_furnishings` |
| 保留 | 日本：CPI：全国：服装及鞋类（2025=100） | `jp_estat_cpi_2025_national_clothing` |
| 保留 | 日本：CPI：全国：医疗保健（2025=100） | `jp_estat_cpi_2025_national_health` |
| 保留 | 日本：CPI：全国：交通通信（2025=100） | `jp_estat_cpi_2025_national_transport` |
| 保留 | 日本：CPI：全国：教育（2025=100） | `jp_estat_cpi_2025_national_education` |
| 保留 | 日本：CPI：全国：文化娱乐（2025=100） | `jp_estat_cpi_2025_national_recreation` |
| 保留 | 日本：CPI：全国：其他杂项（2025=100） | `jp_estat_cpi_2025_national_misc` |
| 隐藏 | 日本：CPI：东京区部：总项（2025=100） | `jp_estat_cpi_2025_tokyo_all` |
| 隐藏 | 日本：CPI：东京区部：除生鲜食品（2025=100） | `jp_estat_cpi_2025_tokyo_ex_fresh` |
| 隐藏 | 日本：CPI：东京区部：除生鲜食品及能源（2025=100） | `jp_estat_cpi_2025_tokyo_ex_fresh_energy` |
| 隐藏 | 日本：CPI：东京区部：食品（2025=100） | `jp_estat_cpi_2025_tokyo_food` |
| 隐藏 | 日本：CPI：东京区部：居住（2025=100） | `jp_estat_cpi_2025_tokyo_housing` |
| 隐藏 | 日本：CPI：东京区部：水电燃气（2025=100） | `jp_estat_cpi_2025_tokyo_utilities` |
| 隐藏 | 日本：CPI：东京区部：家具及家务用品（2025=100） | `jp_estat_cpi_2025_tokyo_furnishings` |
| 隐藏 | 日本：CPI：东京区部：服装及鞋类（2025=100） | `jp_estat_cpi_2025_tokyo_clothing` |
| 隐藏 | 日本：CPI：东京区部：医疗保健（2025=100） | `jp_estat_cpi_2025_tokyo_health` |
| 隐藏 | 日本：CPI：东京区部：交通通信（2025=100） | `jp_estat_cpi_2025_tokyo_transport` |
| 隐藏 | 日本：CPI：东京区部：教育（2025=100） | `jp_estat_cpi_2025_tokyo_education` |
| 隐藏 | 日本：CPI：东京区部：文化娱乐（2025=100） | `jp_estat_cpi_2025_tokyo_recreation` |
| 隐藏 | 日本：CPI：东京区部：其他杂项（2025=100） | `jp_estat_cpi_2025_tokyo_misc` |

### 劳动力调查（12）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：就业人数：总计（15岁及以上，未季调） | `jp_estat_lfs_employed_total_nsa` |
| 隐藏 | 日本：就业人数：男性（15岁及以上，未季调） | `jp_estat_lfs_employed_male_nsa` |
| 隐藏 | 日本：就业人数：女性（15岁及以上，未季调） | `jp_estat_lfs_employed_female_nsa` |
| 保留 | 日本：失业人数：总计（15岁及以上，未季调） | `jp_estat_lfs_unemployed_total_nsa` |
| 隐藏 | 日本：失业人数：男性（15岁及以上，未季调） | `jp_estat_lfs_unemployed_male_nsa` |
| 隐藏 | 日本：失业人数：女性（15岁及以上，未季调） | `jp_estat_lfs_unemployed_female_nsa` |
| 保留 | 日本：劳动参与率：总计（15岁及以上，未季调） | `jp_estat_lfs_participation_rate_total_nsa` |
| 隐藏 | 日本：劳动参与率：男性（15岁及以上，未季调） | `jp_estat_lfs_participation_rate_male_nsa` |
| 隐藏 | 日本：劳动参与率：女性（15岁及以上，未季调） | `jp_estat_lfs_participation_rate_female_nsa` |
| 保留 | 日本：就业率：总计（15岁及以上，未季调） | `jp_estat_lfs_employment_rate_total_nsa` |
| 隐藏 | 日本：就业率：男性（15岁及以上，未季调） | `jp_estat_lfs_employment_rate_male_nsa` |
| 隐藏 | 日本：就业率：女性（15岁及以上，未季调） | `jp_estat_lfs_employment_rate_female_nsa` |

### 家计调查（4）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：消费支出：二人以上家庭（名义、每户月均、未季调） | `jp_estat_household_consumption_all_nominal_nsa` |
| 保留 | 日本：消费支出：二人以上勤劳者家庭（名义、每户月均、未季调） | `jp_estat_household_consumption_worker_nominal_nsa` |
| 保留 | 日本：实收入：二人以上勤劳者家庭（名义、每户月均、未季调） | `jp_estat_household_income_worker_nominal_nsa` |
| 保留 | 日本：可支配收入：二人以上勤劳者家庭（名义、每户月均、未季调） | `jp_estat_household_disposable_income_worker_nominal_nsa` |

### MHLW工资工时（6）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：每月勤劳统计：现金工资总额指数 | `mhlw_jp_mls_total_cash_earnings_index` |
| 保留 | 日本：每月勤劳统计：所定内工资指数 | `mhlw_jp_mls_scheduled_cash_earnings_index` |
| 保留 | 日本：每月勤劳统计：实际现金工资总额指数（CPI总项平减） | `mhlw_jp_mls_real_total_cash_earnings_index_cpi_all` |
| 保留 | 日本：每月勤劳统计：总实际工时指数 | `mhlw_jp_mls_total_hours_index` |
| 保留 | 日本：每月勤劳统计：加班工时指数 | `mhlw_jp_mls_overtime_hours_index` |
| 保留 | 日本：每月勤劳统计：常用雇员指数 | `mhlw_jp_mls_regular_employment_index` |

### 消费者信心（5）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：消费者态度指数（季调、二人以上家庭） | `jpov_c15_consumer_conf_sa` |
| 保留 | 日本：消费者意识：生活状况（季调、二人以上家庭） | `esri_jp_consumer_conf_livelihood_sa` |
| 保留 | 日本：消费者意识：收入增长（季调、二人以上家庭） | `esri_jp_consumer_conf_income_growth_sa` |
| 保留 | 日本：消费者意识：就业环境（季调、二人以上家庭） | `esri_jp_consumer_conf_employment_sa` |
| 保留 | 日本：消费者意识：耐用品购买时机（季调、二人以上家庭） | `esri_jp_consumer_conf_durable_goods_sa` |

### 国际收支（8）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 国际收支：经常账户余额 | `boj_jp_bop_current_account` |
| 保留 | 国际收支：货物余额 | `boj_jp_bop_goods` |
| 保留 | 国际收支：服务余额 | `boj_jp_bop_services` |
| 保留 | 国际收支：初次收入余额 | `boj_jp_bop_primary_income` |
| 保留 | 国际收支：二次收入余额 | `boj_jp_bop_secondary_income` |
| 保留 | 国际收支：金融账户余额 | `boj_jp_bop_financial_account` |
| 保留 | 国际收支：直接投资余额 | `boj_jp_bop_direct_investment` |
| 保留 | 国际收支：证券投资余额 | `boj_jp_bop_portfolio_investment` |

### 景气观察者（8）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本:景气观察者调查:现状判断DI:合计（季调） | `cao_jp_watchers_current_total_di_sa` |
| 隐藏 | 日本:景气观察者调查:现状判断DI:家庭动向相关（季调） | `cao_jp_watchers_current_household_di_sa` |
| 隐藏 | 日本:景气观察者调查:现状判断DI:企业动向相关（季调） | `cao_jp_watchers_current_corporate_di_sa` |
| 隐藏 | 日本:景气观察者调查:现状判断DI:就业相关（季调） | `cao_jp_watchers_current_employment_di_sa` |
| 保留 | 日本:景气观察者调查:先行判断DI:合计（季调） | `cao_jp_watchers_outlook_total_di_sa` |
| 隐藏 | 日本:景气观察者调查:先行判断DI:家庭动向相关（季调） | `cao_jp_watchers_outlook_household_di_sa` |
| 隐藏 | 日本:景气观察者调查:先行判断DI:企业动向相关（季调） | `cao_jp_watchers_outlook_corporate_di_sa` |
| 隐藏 | 日本:景气观察者调查:先行判断DI:就业相关（季调） | `cao_jp_watchers_outlook_employment_di_sa` |

### 零售销售（10）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：零售销售总额 | `meti_jp_retail_retail_total_value_nsa` |
| 隐藏 | 日本：综合商品零售销售额 | `meti_jp_retail_general_merchandise_value_nsa` |
| 隐藏 | 日本：纺织服装及个人用品零售销售额 | `meti_jp_retail_apparel_value_nsa` |
| 保留 | 日本：食品饮料零售销售额 | `meti_jp_retail_food_beverages_value_nsa` |
| 保留 | 日本：汽车零售销售额 | `meti_jp_retail_motor_vehicles_value_nsa` |
| 隐藏 | 日本：机械器具零售销售额 | `meti_jp_retail_machinery_equipment_value_nsa` |
| 保留 | 日本：燃料零售销售额 | `meti_jp_retail_fuel_value_nsa` |
| 隐藏 | 日本：医药品及化妆品零售销售额 | `meti_jp_retail_medicine_toiletries_value_nsa` |
| 隐藏 | 日本：其他零售销售额 | `meti_jp_retail_other_value_nsa` |
| 保留 | 日本：无店铺零售销售额 | `meti_jp_retail_nonstore_value_nsa` |

### 机械订单（13）

| 处理 | 指标 | code |
|---|---|---|
| 隐藏 | 日本：机械订单总额（季调） | `esri_jp_machinery_orders_total_sa` |
| 隐藏 | 日本：机械订单总额（除船舶、季调） | `esri_jp_machinery_orders_total_ex_ships_sa` |
| 保留 | 日本：机械订单：海外需求（季调） | `esri_jp_machinery_orders_overseas_sa` |
| 隐藏 | 日本：机械订单：政府需求（季调） | `esri_jp_machinery_orders_government_sa` |
| 隐藏 | 日本：机械订单：民间需求（季调） | `esri_jp_machinery_orders_private_sa` |
| 隐藏 | 日本：机械订单：民间需求（除船舶、季调） | `esri_jp_machinery_orders_private_ex_ships_sa` |
| 保留 | 日本：核心机械订单：民间需求（除船舶及电力、季调） | `esri_jp_machinery_orders_private_ex_volatile_sa` |
| 保留 | 日本：机械订单：制造业（季调） | `esri_jp_machinery_orders_manufacturing_sa` |
| 隐藏 | 日本：机械订单：非制造业（季调） | `esri_jp_machinery_orders_nonmanufacturing_sa` |
| 隐藏 | 日本：机械订单：非制造业（除船舶、季调） | `esri_jp_machinery_orders_nonmanufacturing_ex_ships_sa` |
| 保留 | 日本：机械订单：非制造业（除船舶及电力、季调） | `esri_jp_machinery_orders_nonmanufacturing_ex_volatile_sa` |
| 隐藏 | 日本：机械订单：代理店需求（季调） | `esri_jp_machinery_orders_through_agencies_sa` |
| 保留 | 日本：机械订单：国内需求（季调） | `esri_jp_machinery_orders_domestic_sa` |

### 外汇储备（10）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：外汇储备资产总额 | `mof_jp_reserves_total` |
| 保留 | 日本：外币储备 | `mof_jp_reserves_foreign_currency` |
| 保留 | 日本：外币储备：证券 | `mof_jp_reserves_securities` |
| 保留 | 日本：外币储备：存款 | `mof_jp_reserves_deposits` |
| 隐藏 | 日本：IMF储备头寸 | `mof_jp_reserves_imf_position` |
| 隐藏 | 日本：特别提款权 | `mof_jp_reserves_sdr` |
| 保留 | 日本：黄金储备价值 | `mof_jp_reserves_gold_value` |
| 保留 | 日本：黄金储备数量 | `mof_jp_reserves_gold_volume` |
| 隐藏 | 日本：其他储备资产 | `mof_jp_reserves_other_reserve_assets` |
| 隐藏 | 日本：其他外币资产 | `mof_jp_reserves_other_foreign_currency_assets` |

### 访日外客（6）

| 处理 | 指标 | code |
|---|---|---|
| 保留 | 日本：访日外客人数：总数 | `jnto_jp_visitor_arrivals_total` |
| 隐藏 | 日本：访日外客人数：韩国籍 | `jnto_jp_visitor_arrivals_south_korea` |
| 隐藏 | 日本：访日外客人数：中国籍 | `jnto_jp_visitor_arrivals_china` |
| 隐藏 | 日本：访日外客人数：台湾 | `jnto_jp_visitor_arrivals_taiwan` |
| 隐藏 | 日本：访日外客人数：香港 | `jnto_jp_visitor_arrivals_hong_kong` |
| 隐藏 | 日本：访日外客人数：美国籍 | `jnto_jp_visitor_arrivals_united_states` |

## 过滤后仍需入库的51条

### 周期、就业与政策（7）

- 景气动向指数：领先CI
- 景气动向指数：一致CI
- 景气动向指数：滞后CI
- 全国完全失业率（季调）
- 有效求人倍率（季调）
- BOJ政策利率
- 美元兑日元（月均）

### 贸易与外部资产负债（11）

- 出口总额
- 进口总额
- 贸易差额
- 对外资产总额
- 对外负债总额
- 净国际投资头寸
- 对外债务总额
- 居民买卖海外股票净额
- 居民买卖海外债券净额
- 非居民买卖日本股票净额
- 非居民买卖日本债券净额

### BOJ资金循环（8）

- 居民金融资产总额
- 居民现金及存款
- 居民股票及投资信托
- 非金融企业金融负债
- 非金融企业贷款负债
- 一般政府债务证券
- 一般政府金融资产负债差额
- 海外部门对日净头寸

### 企业与财政（12）

- 法人企业销售额
- 法人企业经常利润
- 法人企业设备投资
- 法人企业库存
- 法人企业总资产
- 法人企业负债
- 法人企业权益比率
- 中央政府收入
- 中央政府支出
- 财政收支
- 普通国债余额
- 国债付息支出

### 住房与人口（11）

- 新屋开工户数：全国
- 新屋开工面积：全国
- 自住住房开工
- 出租住房开工
- 出售住房开工
- 全国住宅价格指数
- 总人口
- 15–64岁人口
- 65岁及以上人口占比
- 出生人数
- 死亡人数

### 旅游总量补充（2）

- 访日外国人旅行消费总额
- 外国人延住宿人数：全国

这些名称是接入范围，不预先伪造官方series code。每个域仍需在Spec阶段确认官方代码、口径、历史起点、单位和是否存在可复用事实。

## 明确排除或延后

- 都道府县、市区町村和城市级序列。
- 海关HS品目、贸易伙伴国、港口和运输方式交叉表。
- IIP、零售、机械订单、工资和法人企业统计的大规模行业明细。
- 景气观察者地区与行业分项。
- 访日游客来源国、目的地、都道府县住宿和消费交叉表。
- 单城/分地区房价和土地交易。
- 能源、农业、气象、环境以及JSDA/JPX行业活动，除非后续出现明确分析需求。

## 时间估算

- 精简现有目录：0.5–1个工作日，包括停订、隐藏、引用检查和生产审计。
- 新增51条核心序列：5–8个人日；Agent B/C并行时约3–5个日历工作日。
- 香港部署、历史回填、全域抽查和订阅核对：0.5–1个工作日，已包含在上述日历估算中。
- 若海关、MOF或MLIT文件结构改变或官方代码需要人工逐表确认，保守上限为7–10个工作日。

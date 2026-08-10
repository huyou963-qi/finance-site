# 中国宏观经济 Overview 分析

本维度是中国宏观研究的总入口，使用两套四图模板依次回答：增长的量价组合是否改善、增长由谁贡献、月度领先与同步数据是否确认、投资由谁驱动、财政支出是否托底，以及价格和外贸是否交叉验证。它不替代财政、金融条件、房地产、通胀或外部部门专题。

## 内置模板

### 中国经济 Overview · 增长脉冲

1. 季度实际 GDP 同比、名义 GDP 同比与隐含 GDP 平减指数季度同比。
2. 最终消费、资本形成和净出口的 GDP 增长贡献率。
3. 制造业与非制造业 PMI 新订单。
4. 规模以上工业增加值、社会消费品零售总额当月同比与固定资产投资累计同比。

隐含 GDP 平减指数先以同季度名义 GDP 除以不变价 GDP，再对该比值做同季同比。实现不会使用“名义增速减实际增速”的近似，也不会用数组前四项替代同季度匹配。

### 中国经济 Overview · 需求结构与政策支撑

1. 总固定资产投资与制造业、基础设施、房地产开发投资累计同比。
2. 广义财政支出累计额及其累计同比。
3. CPI 与 PPI 同比。
4. 出口与进口当月美元同比。

广义财政支出定义为一般公共预算支出累计额与政府性基金预算支出累计额之和。同比对合计额按上年同月计算；任一账本缺值时不把缺失项当作零。

## 口径纪律

- 固投四条线都是累计同比增速，只用于识别驱动方向，不是贡献率或拉动百分点。
- 基础设施投资在 2026 年发生统计范围断点：新口径纳入电力、热力、燃气及水生产和供应业。模板标题和图注均明确提示，不静默拼接解释。
- GDP 贡献率不是 GDP 支出占比，允许负贡献。
- 工业、社零和进出口为当月同比，固投为年内累计同比，只比较方向和拐点。
- 广义财政支出是两本账支出代理，不是完整合并政府支出。

## 数据接入与验证

所有原始序列均来自既有正式调度域。新增的基础设施投资累计同比扩展现有 `nbs-fai` 官方发布稿解析器，不创建第二个国家统计局固投数据源。

```bash
npm run data:seed-nbs-fai
npm run data:sync-nbs-fai
npm run data:verify-nbs-fai -- --db

npm run data:seed-nbs-realestate
npm run data:verify-nbs-realestate -- --db

npm run data:sync-mof-fiscal
npm run data:verify-mof-fiscal -- --db

npm run data:seed-release-packages
npm run data:verify-nbs-retail -- --db
npm run data:verify-mofcom-trade -- --db
npm run data:verify-cn-economy-overview -- --db
```

完整指标、图槽和验收标准见 [cn-economy-overview.spec.md](./specs/cn-economy-overview.spec.md)。

# 个股经营里程碑检索清单

对给定 `symbol`（任意公司），按时间窗逐项检索；无可靠来源则记入 `skipped`。  
下列条目按**经营语义**组织；括号内为行业举例，不是必选题。

## A. 产品（company.product）

- [ ] 首款量产 / 商业化产品发布或交付
- [ ] 主力产品线：发布、量产启动、首批客户交付（分开建条，勿混成一条）
- [ ] 打开大众市场或收入结构转折的 SKU / 服务 / 适应症
- [ ] 重大改版 / 停产（仅当对收入有清晰影响）

举例：车型发布与量产；芯片/终端旗舰；药品获批与上市；平台重大版本。

## B. 产能（company.capacity）

- [ ] 关键制造或运营设施：协议、开工、试产、正式投产
- [ ] 关键上游或配套产能投产（晶圆、电池、原料、封装等）
- [ ] 数据中心 / 物流枢纽 / 门店网络等供给拐点（若该公司供给瓶颈在此）
- [ ] 海外本地化或出口枢纽地位确立（可写在 impact）
- [ ] 重大关停或产能出清（仅当改变供给格局）

## C. 政策（policy.*，assets 必含该 ticker）

- [ ] 补贴 / 税收抵免 / 政府采购倾斜（生效日）
- [ ] 行业强制标准、配额、许可、定价或积分类监管
- [ ] 外资 / 准入政策
- [ ] 贸易 / 关税 / 出口管制中直接影响该公司供应链或市场者
- [ ] 国际规则（仅当公司收入或成本显著暴露于该规则）

每条政策必须写 `payload.impact.summary`：对该公司需求、成本、准入或利润的具体影响，禁止只复述政策标题。

## D. 可选公司大事（非本 Skill 必选，可用 company-matter）

- [ ] 并购/剥离 `company.mna`
- [ ] 回购/增发/分红 `company.capital`
- [ ] 战略合作/大单 `company.partnership`
- [ ] 重大诉讼/对公司处罚 `company.litigation`
- [ ] 供应链关键节点 `company.supply`

## E. 排除

- [ ] 季报 / 年报披露日（SEC / 交易所已有）
- [ ] 拆分、常规 8-K 人事（非战略级）
- [ ] 分析师评级、目标价（用 market-event-ingest 的 rating 模式）
- [ ] 无日期的「计划中」传闻

## F. 入库前（仅 Admin 共享库）

- [ ] `GET /api/equity/stocks/{symbol}/events` 排除 SEC 重复
- [ ] `GET /api/events?assets={symbol}&from=&to=` 语义去重 / merge
- [ ] `markerLabel` ≤ 4 字；`tags` 含 `milestone`
- [ ] 对照 `templates/ingest-output.schema.json` 自检

普通用户导入经营轴只需本地 JSON 合法；无需跑 import-ingest。

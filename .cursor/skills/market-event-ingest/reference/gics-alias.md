# GICS 行业标签

入库 `industries[]` **优先写 GICS sector/industry code**（如 `45`、`4520`）。

| 码 | Sector |
|----|--------|
| 10 | Energy / 能源 |
| 15 | Materials / 原材料 |
| 20 | Industrials / 工业 |
| 25 | Consumer Discretionary / 可选消费 |
| 30 | Consumer Staples / 必需消费 |
| 35 | Health Care / 医疗保健 |
| 40 | Financials / 金融 |
| 45 | Information Technology / 信息技术 |
| 50 | Communication Services / 通信服务 |
| 55 | Utilities / 公用事业 |
| 60 | Real Estate / 房地产 |

中文别名入库时会被规范为上表代码（见 `normalizeIndustryTag`）。  
更细 industry code 可写 4/6/8 位（来自 `EquitySecurity.gicsIndustryCode`）。

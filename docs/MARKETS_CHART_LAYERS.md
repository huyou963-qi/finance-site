# 行情页多资产 / 基本面叠加（Chart Layers）

设计目标：在 `/markets` Lightweight Charts 上用可声明的 **Series Layer** 叠加多资产价格、资产运算（`-` `/` 及括号链式）与基本面序列，并支持右/左/独立/副图坐标轴。

## 模型

见 [`src/lib/chart/chartLayers.ts`](../src/lib/chart/chartLayers.ts)：

- `price` / `expr` / `fundamental` 三种 `source`
- `transform`: `raw` | `index100` | `pctChange`
- `axis`: `right` | `left` | `scale` | `pane`
- 主 K 线不在 Layer 列表内；额外层上限 **5**
- 持久化：`localStorage` key `markets:chartLayers:v1:{SYMBOL}`

## 表达式

[`src/lib/chart/layerExpression.ts`](../src/lib/chart/layerExpression.ts)：安全递归下降解析，禁止 `eval`。支持 `AAPL - MSFT`、`AAPL / SPY`、`(AAPL / SPY) - (MSFT / SPY)`。时间对齐为共同交易日内连接（[`alignSeries.ts`](../src/lib/chart/alignSeries.ts)）。

## 数据 API

| 用途 | 端点 |
|------|------|
| 叠加价格 | 现有 `GET /api/data/klines` |
| TTM PE 副图 / Layer | 优先 `GET /api/data/chart-fundamentals`（SEC）；失败回退 `ttm-pe`（FMP） |
| Forward EPS | `GET /api/data/forward-pe?symbol=`（FMP，需 `FMP_API_KEY`） |
| 遗留 FMP only | `GET /api/data/ttm-pe` 仍可作为 fallback |

## UI

顶栏 **「叠加」** 面板：[`ChartLayersPanel`](../src/components/chart/ChartLayersPanel.tsx)。模板：vs SPY、PE、价差；对比模式将可见价格层指数化。

## 分阶段

1. 价格 + 运算 + 轴  
2. 基本面 Layer（TTM PE/PB/EPS/营收/利润率）  
3. Forward PE + 高级表达式  
4. 对比模式模板、结构指纹重建、向前加载时补拉叠加标的  

## 区间统计与叠加层

划定区间后，统计面板除主 K 外会列出当前可见叠加层（价格 / 表达式 / 基本面）的起点、终点、高低、涨跌幅与振幅；与主图按交易日对齐，运算式缺日不计入。

# finance-site

基于计划的「宏观数据 + K 线」本地调试脚手架：**Next.js（App Router）** + **Apache ECharts（宏观）** + **TradingView Lightweight Charts（K 线）**。

## 选型结论（对应计划）

| 决策 | 说明 |
|------|------|
| 运行时 | **Next.js 15 + React 19 + TypeScript**：支持页面 SSR/SEO，Route Handler 可做 **BFF** 隐藏 API Key。 |
| 宏观图表 | **ECharts**：折线/柱状/多轴与中文文档成熟，适合仪表盘。 |
| K 线 | **Lightweight Charts**：交互与性能适合行情主图。 |

若你更需要纯 SPA，可把同一套图表组件迁到 **Vite + React**，依赖与用法不变。

## 本机环境（Windows）

1. **Node.js LTS**（必需）  
   - 官网安装：https://nodejs.org/  
   - 或用 **winget**：`winget install OpenJS.NodeJS.LTS`

2. **包管理器**：项目默认 **npm**（随 Node 自带）。可选全局安装 **pnpm**：`npm install -g pnpm`

3. **Git**（建议）：https://git-scm.com/download/win  

4. **编辑器**：Cursor / VS Code  

5. **浏览器**：Chrome 或 Edge（调试网络与图表）

可选：若宏观/清洗数据用 Python，另装 **Python 3**；本仓库前端不强制。

## 安装与启动

```bash
cd finance-site
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（一般为 http://localhost:3000）。

- 首页：`/`  
- 宏观示例：`/macro`  
- K 线示例：`/markets`  

## 免费数据源（合规自查）

以下为本项目已对接或可扩展的**免费/注册免费**来源（使用前请阅读各自条款与频率限制）：

| 类型 | 来源 | 本项目用法 |
|------|------|------------|
| 宏观（免密钥） | [世界银行开放数据 API](https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation) | `/api/data/macro?source=worldbank` — 中美 CPI 通胀（年 %） |
| 宏观（需密钥） | [FRED](https://fred.stlouisfed.org/) | `.env.local` 配 `FRED_API_KEY`，`/api/data/macro?source=fred&series=CPIAUCSL` |
| 行情（免密钥） | [Binance 现货公开 K 线](https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data) | `/api/data/klines?symbol=BTCUSDT&interval=1d` |

其它常见选项（可自行接 Route Handler）：**Alpha Vantage**、**Twelve Data**（有免费额度）、**Frankfurter**（汇率，免密钥）、**IMF/OECD**（多为 SDMX/批量）、**Polygon / Finnhub**（限制更多）。股票/指数还可考虑交易所或数据商的合规授权。

### 自建数据库 vs 直接调 API：怎么选？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **直接 API**（浏览器 → 你的后端 → 第三方） | 实现快、数据新；密钥只放在服务端 | 受对方限频与稳定性影响；重复请求浪费配额 |
| **写入自有库（PostgreSQL / TimescaleDB 等）+ 定时同步** | 可做历史归档、拼接多源、Dashboard 任意维度查询；降频稳态 | 需维护同步任务、存储与备份 |

**建议**：演示与小流量用 **Next `fetch` 缓存（本项目已对宏观/行情设置 `revalidate`）**；流量变大、要多源拼接或离线分析时，再上 **数据库 + 定时任务（cron / worker）**。

## 数据与密钥策略

1. 复制 `.env.example` 为 `.env.local`，按需填入 `FRED_API_KEY`、自定义上游等（**勿提交** `.env.local`）。

2. **内置数据路由（推荐）**  
   - `GET /api/data/macro?source=worldbank|fred` — 服务端拉取并缓存宏观序列。  
   - `GET /api/data/klines?symbol=BTCUSDT&interval=1d` — 服务端转发 Binance 公开接口。  

3. **通用代理示例**：`GET /api/proxy-example?path=...`  
   - 读取 `UPSTREAM_API_BASE`、`UPSTREAM_API_KEY`；未配置上游时返回 `501`。

4. 前端在拉取失败时会**回退**到本地随机演示序列，便于离线开发；生产环境应明确错误提示与监控。

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 本地开发（Turbopack） |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint |

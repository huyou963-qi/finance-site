# 行情自选股

行情页 `/markets` 的左侧自选股面板支持搜索添加、收藏当前标的、移除与切换 K 线，桌面和手机版共用数据。

## 存储与账号隔离

- 登录用户：保存至 `public.UserMarketWatchlistItem`，联合主键为 `userId + symbol`。不同设备登录同一账号后读取同一列表；重新打开面板、窗口恢复焦点或页面恢复可见时会刷新。
- 游客：保存在当前浏览器的 `finance-site:markets-watchlist:v1`。登录后使用账号列表，游客列表不自动导入，避免共享浏览器的内容被误归入账号。
- 服务器以 `finance_sid` 会话识别所属用户。客户端提交的 `userId` 仅检查页面是否仍属于当前账号；账号已变化时拒绝写入，要求重新加载。
- 每次添加或删除只操作一个标的，不用整份列表覆盖，避免不同设备同时添加时丢失其他标的。保存失败保留原列表并展示错误，接口返回 `private, no-store`。

## 接口

`GET /api/tools/market-watchlist` 返回 `{ userId, stocks }`，游客返回 `{ userId: null, stocks: [] }`。

`POST` 请求为 `{ userId, stock: { symbol, name, exchange } }`；`DELETE` 请求为 `{ userId, symbol }`。写入需登录，未登录返回 401，客户端账号与会话不一致返回 409，无效参数返回 400。

## 部署

部署前执行 `npm run db:migrate`，应用 `20261009110000_user_market_watchlist`。新增表及用户外键，不修改现有用户数据；删除用户时级联删除其自选股。

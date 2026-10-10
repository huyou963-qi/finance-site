# 行情自选股

行情页 `/markets` 的左侧自选股面板支持搜索添加、收藏当前标的、移除与切换 K 线，桌面和手机版共用数据。

分组下拉框可查看全部、未分组或指定分组；“管理分组”支持新增、编辑组名和删除。股票卡片的 `⋯` 按钮可调整归属；添加当前标的时归入正在查看的分组（“全部”视图归入未分组）。组名为 1–30 个字符，同一用户不能重名。删除分组会把股票移回未分组，不删除股票。

## 存储与账号隔离

- 登录用户：保存至 `public.UserMarketWatchlistItem`，联合主键为 `userId + symbol`。不同设备登录同一账号后读取同一列表；重新打开面板、窗口恢复焦点或页面恢复可见时会刷新。
- 自定义组名保存在 `public.UserMarketWatchlistGroup`，股票通过 `groupId` 关联所属用户的分组；已有股票保持未分组。
- 游客：保存在当前浏览器的 `finance-site:markets-watchlist:v1`。登录后使用账号列表，游客列表不自动导入，避免共享浏览器的内容被误归入账号。
- 服务器以 `finance_sid` 会话识别所属用户。客户端提交的 `userId` 仅检查页面是否仍属于当前账号；账号已变化时拒绝写入，要求重新加载。
- 每次添加或删除只操作一个标的，不用整份列表覆盖，避免不同设备同时添加时丢失其他标的。保存失败保留原列表并展示错误，接口返回 `private, no-store`。

## 接口

`GET /api/tools/market-watchlist` 返回 `{ userId, stocks, groups }`，游客返回空列表。登录用户的分组随账号同步；游客分组随股票保存在本机 v2 存储，兼容读取旧 v1 股票列表。

`POST` 请求为 `{ userId, stock: { symbol, name, exchange } }`；`DELETE` 请求为 `{ userId, symbol }`。写入需登录，未登录返回 401，客户端账号与会话不一致返回 409，无效参数返回 400。

`POST` 可附带 `groupId`。`PATCH` 使用 `action: createGroup | renameGroup | deleteGroup | moveStock`，并传入对应的 `name` / `groupId` / `symbol`。分组读写与股票调整均验证会话所属用户；无此分组返回 404，重名返回 400。删除分组在事务中先解除股票归属，再删除分组。

## 部署

部署前执行 `npm run db:migrate`，应用 `20261009110000_user_market_watchlist`。新增表及用户外键，不修改现有用户数据；删除用户时级联删除其自选股。

分组功能追加迁移 `20261010100000_market_watchlist_groups`，新增分组表、联合外键与可空的股票归属字段，不改动既有自选股。

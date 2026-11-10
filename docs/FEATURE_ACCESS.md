# 功能页权限

管理员在 **`/admin/feature-access`**（账户菜单 → 管理 → 功能页权限）为每个功能页配置状态与访问权限。
配置落 `public.feature_access_policy` 单例（`id=default`，JSON `version: 2`）。

## 四类用户

| 身份 | 判定 |
|------|------|
| 游客 | 未登录 |
| 普通用户 | 已注册，无 Pro 权益（试用已结束，或管理员创建的账号从未试用） |
| Pro 用户 | 付费未过期，**或自助注册后的 7 天试用期内** |
| 管理员 | 永远最高权限：可见并可使用全部功能，不受任何配置影响 |

## 管理员永远可见全部页面（强制）

- 管理员不是被配置的对象：`resolveFeatureAccess` 对管理员恒返回 `allowed`，`/api/access/features` 对管理员返回全部功能。
  `/admin/feature-access` 只配置**游客 / 普通用户 / Pro 用户**这三类身份能否看到某页，不能也不应该对管理员隐藏任何页面。
- 因此**每个登记在 `FEATURE_CATALOG` 的功能页都必须有导航入口**（电脑版顶栏与手机版菜单），入口统一用
  `useVisibleFeatures().can(featureId)` 过滤。开发中的页面照样登记入口：过滤后只有管理员和被勾选预览的身份看得见，
  客户看不到。「不对客户开放」靠权限过滤实现，**不是靠不加入口**——不加入口会让管理员也找不到页面。
- 例：「股票数据」`/equity/data` 曾因开发中而没加导航入口，管理员只能手输 URL 进入，2026-11 已补入口。

- 例外：`kind: "setting"` 的站点级开关（如 `site-language-en` 英文界面）不对应页面、`paths` 为空，
  入口是对应控件（语言切换），同样按 `can()` 过滤，电脑版与手机版都要有。

## 两种页面状态

| 状态 | 配置项 | 行为 |
|------|--------|------|
| **开发中** | 游客 / 普通用户 / Pro 用户 三个勾选框（谁能预览） | 未勾选的身份：导航无入口，直达 URL 显示「正在开发中，敬请期待」 |
| **已上线** | 是否「Pro 专属」 | 所有人导航都有入口。Pro 专属时：Pro 用户正常用；游客 → 引导注册（注册即送 7 天 Pro 试用）；普通用户 → 引导升级 Pro（试用已结束时文案提示「试用已结束」）；导航入口旁显示 Pro 标记 |

- 切换状态不会丢另一种状态下的配置（`preview` 与 `proOnly` 同时保存，只按当前 `status` 生效）。
- 管理页每行右侧「实际效果」列实时预览三类身份的结果（可用 / 引导注册 / 引导升级 / 不可见）。
- **只管页面入口**：页面内部更细的 Pro 权益（周报全文、策略保存、回测积分等）仍由各 API 的
  `requireProUser` / `userCanAccessProFeatures` 决定，两套机制互不替代。
- 旧版 v1 策略 `{ standard, pro }` 读取时自动转换：普通可见 → 已上线免费；仅 Pro → 已上线 Pro 专属；都不可见 → 开发中无人可见。

## 代码位置

| 文件 | 作用 |
|------|------|
| `src/lib/access/featureCatalog.ts` | 功能目录（id / 标签 / 路由前缀 / 默认规则）+ 纯函数判定 `resolveFeatureAccess`，有单测 |
| `src/lib/access/featureAccess.ts` | 读写策略（15s 内存缓存）、从 cookie/请求解析访问者 |
| `src/components/access/FeatureGate.tsx` | 服务端页面守卫；`FeatureLocked.tsx` 按原因渲染开发中/注册/升级引导 |
| `src/hooks/useVisibleFeatures.ts` | 客户端导航过滤与 Pro 标记，取 `/api/access/features`（`features` + `locked`） |
| `src/app/api/admin/feature-access/route.ts` | 管理端读写（`requireAdmin`） |
| `src/app/admin/feature-access/` | 管理页 UI |

策略表读不到（未 migrate / 库故障）时退回目录里的默认规则，不会打挂站点。

## 新增功能页时

1. 在 `FEATURE_CATALOG` 增加一项：`id`、`label`、`group`、`paths`（路由前缀）、`defaults`
   （新页面通常先用 `IN_DEVELOPMENT`，上线后在管理页切「已上线」）。
2. 页面 `page.tsx` 用 `<FeatureGate featureId="...">` 包住内容（异步页可用 `checkFeatureAccess` 内联判定），
   并加 `export const dynamic = "force-dynamic"`（守卫要读 cookie）。
3. **必须**在导航（`SiteHeaderNav` 顶栏与手机菜单，或所属分组的侧栏）加入口，用 `useVisibleFeatures().can("...")`
   过滤、`.locked("...")` 加 Pro 标记——开发中的页面也要加，否则管理员看不到（见上「管理员永远可见全部页面」）。
   **其他页面里指向该功能的按钮/链接/快捷入口同样要过滤**，否则开发中的功能会从页内入口漏给客户
   （例：行情页、个股研究页曾直接链到未完成的「创建投资案例」，已移除）。
   功能没经用户确认发布前，不要新增**未经过滤**的入口；经 `can()` 过滤的导航入口对客户不可见，可以且应该加。
4. 仅管理员可用且永不开放的页面打上 `adminOnly: true`，管理页会锁定该行。

## 部署

表已在 `20260912090000_feature_access_policy` 建好，本次无 schema 变更、无需 migrate / seed。

# 功能页权限（普通用户 / Pro 用户）

管理员在 **`/admin/feature-access`**（账户菜单 → 管理 → 功能页权限）配置每个功能页对
「普通用户」和「Pro 用户」是否可见。配置落 `public.feature_access_policy` 单例（`id=default`）。

## 语义

| 身份 | 判定 |
|------|------|
| 管理员 | 始终可见全部功能，不受配置影响 |
| Pro 用户（付费未过期 / 7 天试用内） | 看 `pro` 列 |
| 普通注册用户 | 看 `standard` 列 |
| 未登录访客 | 同「普通用户」列 |

- **单调约束**：`standard=true ⇒ pro=true`。UI 与服务端 `normalizeFeatureAccessPolicy` 都会强制修正，
  避免出现「普通能看、Pro 看不到」。
- **只管页面入口**：页面内部更细的 Pro 权益（周报全文、策略保存、回测积分等）仍由各 API 的
  `requireProUser` / `userCanAccessProFeatures` 决定，两套机制互不替代。
- 关闭后：导航入口消失，直接访问 URL 渲染锁定页（仅 Pro 可见的功能会给 `/pricing` 升级引导）。

## 代码位置

| 文件 | 作用 |
|------|------|
| `src/lib/access/featureCatalog.ts` | 功能目录（id / 标签 / 路由前缀 / 默认可见性）+ 纯函数判定，有单测 |
| `src/lib/access/featureAccess.ts` | 读写策略（15s 内存缓存）、从 cookie/请求解析访问者 |
| `src/components/access/FeatureGate.tsx` | 服务端页面守卫；`FeatureLocked.tsx` 是锁定页 |
| `src/hooks/useVisibleFeatures.ts` | 客户端导航过滤，取 `/api/access/features` |
| `src/app/api/admin/feature-access/route.ts` | 管理端读写（`requireAdmin`） |
| `src/app/admin/feature-access/` | 管理页 UI |

策略表读不到（未 migrate / 库故障）时退回目录里的默认可见性，不会打挂站点。

## 新增功能页时

1. 在 `FEATURE_CATALOG` 增加一项：`id`、`label`、`group`、`paths`（路由前缀）、`defaults`。
2. 页面 `page.tsx` 用 `<FeatureGate featureId="...">` 包住内容（异步页可用 `checkFeatureAccess` 内联判定），
   并加 `export const dynamic = "force-dynamic"`（守卫要读 cookie）。
3. 导航入口用 `useVisibleFeatures().can("...")` 过滤。
4. 仅管理员可用的页面把 `adminOnly: true` 打上，管理页会锁定该行不可编辑。

## 部署

```bash
npm run db:migrate   # 20260912090000_feature_access_policy
```

不需要 seed：无记录时按目录默认值运行，管理员保存一次后写入单例。

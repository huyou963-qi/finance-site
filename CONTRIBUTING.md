# 贡献指南（3–5 人 GitHub 协作）

感谢参与 **finance-site**。本文说明分支、PR、数据库与 AI 协作约定。

## 1. 首次加入

```bash
git clone https://github.com/<org>/finance-site.git
cd finance-site
```

1. 安装 **Node.js 20 LTS**（可用 [nvm-windows](https://github.com/coreybutler/nvm-windows) 或 `fnm`，仓库有 `.nvmrc`）
2. `npm install`
3. 复制环境：`copy .env.example .env.local`（macOS/Linux 用 `cp`）
4. 向负责人索取/配置 `DATABASE_URL`、`FMP_API_KEY` 等（**不要**发到公开 Issue）
5. `npm run db:migrate`
6. `npm run dev` → http://localhost:3000

用 **Cursor** 开发时，打开本仓库即可自动加载 `.cursor/rules/`。给 AI 任务时可 `@AGENTS.md`。

## 2. 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 可部署的稳定线，受保护 |
| `feature/<模块>-<简述>` | 新功能 / 修复 |
| `fix/<简述>` | 紧急修复（可选） |

示例：

- `feature/macro-folder-dnd`
- `feature/markets-ibkr-search`
- `fix/statistical-analysis-suspense`

```bash
git checkout main
git pull origin main
git checkout -b feature/macro-xxx
# ... 开发 ...
git push -u origin feature/macro-xxx
```

在 GitHub 上开 **Pull Request** → 选 `main` 为 base。

## 3. Pull Request 规范

- 标题：简短说明「做了什么」（中文或英文均可）
- 填写 PR 模板（变更说明、测试、是否含 migration）
- 至少 **1 人 Review** 后再合并（建议 2 人改同一模块时）
- CI 绿灯（`build` + `lint`）才能合并
- 合并方式：**Squash merge**（保持 `main` 历史清晰）

合并后：

```bash
git checkout main
git pull origin main
# 若 PR 含 migration：
npm run db:migrate
```

## 4. 数据库变更（重要）

1. 在 Issue 或群里说「我要改 schema」
2. 本地改 `prisma/schema.prisma` → `npm run db:migrate:dev`
3. 把 `prisma/migrations/` 一并提交
4. PR 描述写明：其他人合并后需执行 `npm run db:migrate`

**禁止**：两人同时提交不同 migration 到同一 PR 周期；禁止手改已上 `main` 的 migration 文件。

## 5. 代码与提交

- 提交信息：一句说清目的，例如 `fix: wrap statistical-analysis in Suspense`
- 小步提交，一个 PR 只做一类事
- 提交前本地：

```bash
npm run lint
npm run build
```

Windows：构建前 **停止** `npm run dev` / `npm run start`，避免 Prisma 文件锁。

## 6. GitHub 仓库设置（维护者做一次）

在 GitHub → **Settings → Branches → Branch protection rules** → `main`：

- [x] Require a pull request before merging
- [x] Require approvals（1）
- [x] Require status checks to pass（选 `CI / build`）
- [x] Do not allow bypassing（可选，管理员也走 PR）

**Settings → Secrets and variables**（若用 GitHub Actions 部署再加；当前 CI 仅需 dummy DB URL）。

邀请成员：**Settings → Collaborators**，3–5 人添加为 Write 或 Maintain。

## 7. 用 AI 协同的建议

| 做法 | 说明 |
|------|------|
| 共享 `.cursor/rules/` | 已入库，全员一致 |
| 任务写清范围 | 「只改 `src/app/macro/`，不要动 prisma」 |
| 一任务一分支 | 避免两人同一文件冲突 |
| PR 里 @ 人 | 指定 Reviewer |
| 大文件先拆 | 再让 AI 改子组件 |

## 8. 冲突处理

```bash
git checkout feature/xxx
git fetch origin
git merge origin/main
# 解决冲突后
git add .
git commit
git push
```

宏观/K 线大文件冲突时，优先保留 **双方功能** 再手动合并 import，不要整文件用一方覆盖。

## 9. 获取帮助

- 架构与命令：`AGENTS.md`
- 环境与数据源：`README.md`
- Bug：GitHub Issue（选 Bug 模板）

## 变更说明

<!-- 用 1–3 句话说明本 PR 的目的与行为变化 -->

## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构（无行为变化）
- [ ] 数据库 migration
- [ ] 文档 / 协作配置
- [ ] 其他

## 测试

<!-- 你如何验证？默认先跑 npm run verify:commit；UI/数据变更再补专项验证。 -->

- [ ] 本地 `npm run verify:commit` 通过（Windows 构建前已停止 dev/start）
- [ ] 新增/修改的业务逻辑已有对应自动化测试，或已说明暂不自动化的原因
- [ ] UI 变更已验证桌面端与移动端关键路径（可附截图）
- [ ] 数据口径变更已验证 as-of、复权、频率、单位与空值边界

## 数据库 / 部署

- [ ] 无 schema 变更
- [ ] 有 migration：合并后需执行 `npm run db:migrate`
- [ ] 需要运行数据脚本（在下方写明命令）：

```bash
# 例如：npm run db:import-xxx
```

## 截图（UI 变更时建议附上）

## 关联 Issue

<!-- Closes #123 -->

# Skill 私有事件投递协议 v1

网页「用户事件 → 用户事件包管理 → Skill 私有投递」登录后创建凭证。凭证绑定当前账号和指定的稳定包 ID，30 天过期，只能写入该包，不能读取账号数据。重新生成会替换旧凭证，撤销不删除已保存事实。不得发送网站密码、Session Cookie 或管理员共享 ingest 密钥。

将凭证放入可信执行环境的 `EVENT_DELIVERY_TOKEN` 密钥变量，不能写入研究 JSON、代码仓库、日志或报告。API 地址采用当前站点的 HTTPS 域名；不要把凭证发到第三方地址。持续更新由外部 Skill/Agent 的任务调度器执行，网页只自动读取已投递的包。

## 请求

`POST /api/user/event-packs`，`Authorization: Bearer <投递凭证>`，`Content-Type: application/json`。

```json
{
  "deliveryId": "gold-research-20261028-001",
  "baseRevision": 0,
  "document": {
    "mode": "company-milestone",
    "pack": { "id": "gold-research", "name": "黄金地缘研究", "symbols": ["GC=F"] },
    "query": { "importTarget": "symbol", "symbol": "GC=F" },
    "events": []
  }
}
```

示例 events 为空，仅说明封装结构；实际提交须为 1–1000 条有效事件，字段沿用 SKILL.md 和 ingest-output.schema.json。包 ID、投递 ID 限 1–128 位字母数字及 `._:-`。最多 1 MB，每包累积最多 2000 条且不超过 2 MB，每账号最多 20 个云端包/凭证。来源链接只能使用无内嵌账号密码的 HTTP(S) URL。不要虚构精确时刻或将未来事件当作已发生事实。显示范围必须明确指定 pack.symbols、query.symbol 或 all-assets。

```sh
curl --fail-with-body "$EVENT_DELIVERY_BASE_URL/api/user/event-packs" \
  -H "Authorization: Bearer $EVENT_DELIVERY_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @delivery.json
```

首次包 baseRevision=0；后续使用上次成功回执 revision。回执含 saved、revision、deliveryId 和 added/updated/unchanged/retained。未提交旧记录保留；不会写入系统共享事件。事实与证据沿用原始记录。云端包与同名浏览器本地包相互独立，网页不会把本地文件自动上传。

## 重试与冲突

- 网络中断或 503：保持同一 deliveryId、baseRevision 和 document 重试。最后一次已接受投递的相同请求返回原回执及 duplicate=true，不增加版本或节点。
- 相同 deliveryId 携带不同内容：409，不能把它当成新修订。新修订使用新 deliveryId。
- 旧 baseRevision 或并发更新：409。先确认上次回执，在网页查看包版本并合并新事实，再用新 ID 和当前版本重投。写入凭证不能读取账号事件；不能盲目猜测递增版本来覆盖。
- 401：凭证失效、已撤销、过期或账号停用；由用户重新授权。
- 403：投递到了凭证未绑定的包；不可更换账号参数绕过。请求不接受 userId。
- 400/413：修正内容或大小后以新投递 ID 提交。

幂等回执仅保留每包最后一次成功提交。较早批次在后续修订后再次重放将因版本不符被拒绝，不会回滚内容。多执行器共享一个包时必须协调版本；建议每项任务使用独立包。

## 网页

登录后每 30 秒在可见页面刷新，重新聚焦时也刷新。云端包显示版本；开关和配色为此浏览器偏好，投递更新不会开启已停用包。同步失败保留已加载内容并提示可能过期。同步成功与符合筛选/上图数量分开，查看“结果说明”检查资产、日期、筛选、上图开关和 K 线对齐。

import { requireAdmin } from "@/lib/api/eventAuth";
import { articleResource, oauthIssuer, parseScopes, registeredClient } from "@/lib/articles/articleOAuth";
import { createConsentHandlers } from "@/lib/articles/oauthConsent";

export const dynamic = "force-dynamic";
export const { GET, POST } = createConsentHandlers({
  resource: articleResource,
  issuer: oauthIssuer,
  client: registeredClient,
  scope: raw => parseScopes(raw ?? "articles:read").join(" "),
  user: requireAdmin,
  title: "授权文章服务",
  description: "read 可读取本人文章及写作所需的站内指标、系统图表；write 可创建、修改草稿及插入图表；publish 可公开发布；unpublish 可撤回文章。",
  denied: () => ({ body: '<h1>请先登录管理员账号</h1><p>在本站完成密码与 TOTP 登录后，返回 ChatGPT 重新连接文章服务。</p><a href="/">打开网站登录</a>', status: 401 }),
});

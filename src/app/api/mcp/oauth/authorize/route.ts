import { OAuthError } from "@/lib/articles/articleOAuth";
import { createConsentHandlers } from "@/lib/articles/oauthConsent";
import { parseResearchScopes, personalReadScope, personalWriteScope, researchClient, researchIssuer, researchResource, researchUserBySession } from "@/lib/researchMcp/oauth";

export const dynamic = "force-dynamic";
export const { GET, POST } = createConsentHandlers({
  resource: researchResource,
  issuer: researchIssuer,
  client: researchClient,
  scope: raw => parseResearchScopes(raw).join(" "),
  user: researchUserBySession,
  title: "授权 GekkoTech AI 数据连接",
  description: "允许此客户端使用你的 Pro 额度查询宏观、美股、研究内容和预测数据。",
  optionalScopes: [
    { scope: personalReadScope, label: "读取你的自选股及股票数据模板" },
    { scope: personalWriteScope, label: "添加自选股或另存新的股票数据模板" },
  ],
  links: '<p><a href="/ai-connections">管理 AI 数据授权</a></p>',
  denied(error) {
    if (error instanceof OAuthError && error.status === 401) {
      return { body: '<h1>请先登录网站</h1><p>登录后回到 AI 客户端重新连接。</p><a href="/">打开 GekkoTech</a>', status: 401 };
    }
    return { body: error instanceof OAuthError && error.code === "pro_required"
      ? '<h1>需要有效的 Pro 订阅</h1><a href="/pricing">查看 Pro 会员</a>'
      : '<h1>AI 数据连接暂不可用</h1>', status: 403 };
  },
});

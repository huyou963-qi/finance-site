import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAccessUserByToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { articleResource } from "@/lib/articles/articleOAuth";
export const dynamic = "force-dynamic";
export const metadata = { title: "ChatGPT 文章授权", robots: { index: false, follow: false } };
export default async function ArticleConnections() {
  const user = await getAccessUserByToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!user || user.role !== "admin") notFound();
  const grants = await prisma.weeklyOAuthGrant.findMany({ where: { userId: user.id, resource: articleResource(), revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
    <Link href="/articles/editor" className="text-fs-accent-text">← 返回文章工作台</Link>
    <h1 className="text-2xl font-semibold">ChatGPT 文章授权</h1>
    <p className="break-all text-sm">MCP 连接地址：{articleResource()}</p>
    {grants.length === 0 && <p>暂无有效授权。</p>}
    {grants.map(grant => <section key={grant.id} className="space-y-3 break-words rounded border border-fs-border p-4">
      <h2 className="font-semibold">{grant.clientId}</h2><p className="text-sm">权限：{grant.scope}</p>
      <p className="text-sm">到期：{grant.expiresAt.toISOString()}</p>
      <form method="post" action="/api/articles/oauth/disconnect"><input type="hidden" name="grantId" value={grant.id} /><button className="rounded border border-fs-border px-4 py-2">撤销此授权</button></form>
    </section>)}
  </main>;
}

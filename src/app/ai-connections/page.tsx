import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getAccessUserByToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { normalizeFeatureAccessPolicy } from "@/lib/access/featureCatalog";
import { isPaidProActive } from "@/lib/billing/access";
import { prisma } from "@/lib/prisma";
import { personalReadScope, personalWriteScope, researchResource, researchScope } from "@/lib/researchMcp/oauth";
import { getResearchUsage } from "@/lib/researchMcp/usage";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AiConnections() {
  const [t, locale, jar] = await Promise.all([getTranslations("aiConnections"), getLocale(), cookies()]);
  const user = await getAccessUserByToken(jar.get(SESSION_COOKIE_NAME)?.value);
  const resource = researchResource();
  const [policyRow, grants] = await Promise.all([
    prisma.featureAccessPolicy.findUnique({ where: { id: "default" } }),
    user ? prisma.weeklyOAuthGrant.findMany({
      where: { userId: user.id, resource, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, clientId: true, expiresAt: true, scope: true },
    }) : [],
  ]);
  const released = normalizeFeatureAccessPolicy(policyRow?.policy).features["research-mcp"]?.status === "released";
  if (!released && user?.role !== "admin" && grants.length === 0) notFound();
  const canConnect = user && (user.role === "admin" || (released && isPaidProActive(user)));
  const usage = canConnect ? await getResearchUsage(user.id) : null;
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

  const scopeLabel = { [researchScope]: t("researchRead"), [personalReadScope]: t("personalRead"), [personalWriteScope]: t("personalWrite") };

  return <section aria-labelledby="ai-connections-title" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
    <h1 id="ai-connections-title" className="text-2xl font-semibold">{t("title")}</h1>
    {usage ? <section className="space-y-3 rounded border border-fs-border p-4">
      <p>{t("howTo")}</p>
      <p className="break-all font-mono text-sm">{resource}</p>
      <p>{t("usage", { used: usage.used, limit: usage.limit })}</p>
      <p className="text-sm text-fs-muted">{t("reset", { date: dateTime.format(usage.resetAt) })}</p>
    </section> : <p>{released ? t("proRequired") : t("unavailable")} {released && <Link href="/pricing" className="text-fs-accent-text underline">{t("viewPlans")}</Link>}</p>}
    {user && <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("authorizedClients")}</h2>
      {grants.length === 0 && <p className="text-sm text-fs-muted">{t("noConnections")}</p>}
      {grants.map(grant => <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-fs-border p-4">
        <div className="min-w-0 break-words">
          <p className="font-semibold">{grant.clientId}</p>
          <p className="text-sm text-fs-muted">{grant.scope.split(" ").flatMap(scope =>
            Object.hasOwn(scopeLabel, scope) ? [scopeLabel[scope as keyof typeof scopeLabel]] : []
          ).join(" · ")}</p>
          <p className="text-sm text-fs-muted">{t("expires", { date: dateTime.format(grant.expiresAt) })}</p>
        </div>
        <form method="post" action="/api/mcp/oauth/disconnect">
          <input type="hidden" name="grantId" value={grant.id} />
          <button className="rounded border border-fs-border px-4 py-2">{t("revoke")}</button>
        </form>
      </div>)}
    </section>}
  </section>;
}

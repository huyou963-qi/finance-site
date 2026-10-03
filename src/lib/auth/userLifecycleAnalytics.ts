import { prisma } from "@/lib/prisma";

type TotalsRow = { total: bigint; verified: bigint; active30: bigint; trial: bigint; trialExpired: bigint; paid: bigint; paidEver: bigint; expiring14: bigint; formerPaid: bigint };
type CohortRow = { month: string; registered: bigint; verified: bigint; paid30: bigint };
type SegmentRow = { name: string; count: bigint };

export async function getUserLifecycleAnalytics() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [totals, cohorts, tags] = await Promise.all([
    prisma.$queryRaw<TotalsRow[]>`
      SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL) AS verified,
        COUNT(*) FILTER (WHERE u."last_login_at" >= NOW() - INTERVAL '30 days') AS active30,
        COUNT(*) FILTER (WHERE u."trial_ends_at" > NOW() AND NOT (u.plan = 'pro' AND (u."plan_expires_at" IS NULL OR u."plan_expires_at" > NOW()))) AS trial,
        COUNT(*) FILTER (WHERE u."trial_ends_at" <= NOW() AND NOT (u.plan = 'pro' AND (u."plan_expires_at" IS NULL OR u."plan_expires_at" > NOW()))) AS "trialExpired",
        COUNT(*) FILTER (WHERE u.plan = 'pro' AND (u."plan_expires_at" IS NULL OR u."plan_expires_at" > NOW())) AS paid,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.payment_order o WHERE o.user_id = u.id AND o.status = 'paid' AND o.product_type <> 'credits')) AS "paidEver",
        COUNT(*) FILTER (WHERE u.plan = 'pro' AND u."plan_expires_at" > NOW() AND u."plan_expires_at" <= NOW() + INTERVAL '14 days') AS expiring14,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.payment_order o WHERE o.user_id = u.id AND o.status = 'paid' AND o.product_type <> 'credits')
          AND NOT (u.plan = 'pro' AND (u."plan_expires_at" IS NULL OR u."plan_expires_at" > NOW()))) AS "formerPaid"
      FROM public."User" u WHERE u.status <> 'closed' AND u.role = 'user'`,
    prisma.$queryRaw<CohortRow[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', u."createdAt"), 'YYYY-MM') AS month,
        COUNT(*) AS registered,
        COUNT(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL) AS verified,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.payment_order o WHERE o.user_id = u.id AND o.status = 'paid'
          AND o.product_type <> 'credits' AND o.paid_at >= u."createdAt" AND o.paid_at < u."createdAt" + INTERVAL '30 days')) AS paid30
      FROM public."User" u WHERE u."createdAt" >= ${start} AND u.role = 'user' AND u.status <> 'closed'
      GROUP BY DATE_TRUNC('month', u."createdAt") ORDER BY DATE_TRUNC('month', u."createdAt")`,
    prisma.$queryRaw<SegmentRow[]>`
      SELECT tag AS name, COUNT(*) AS count FROM public."User" u CROSS JOIN LATERAL UNNEST(u.tags) tag
      WHERE u.status <> 'closed' AND u.role = 'user' GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 20`,
  ]);
  const row = totals[0]!;
  return {
    asOf: now.toISOString(),
    totals: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])),
    cohorts: cohorts.map((item) => ({ month: item.month, registered: Number(item.registered), verified: Number(item.verified), paid30: Number(item.paid30),
      paid30Rate: Number(item.registered) ? Number(item.paid30) / Number(item.registered) : 0 })),
    tags: tags.map((item) => ({ name: item.name, count: Number(item.count) })),
  };
}

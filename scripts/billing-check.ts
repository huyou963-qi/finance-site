/** Read-only readiness check. Never prints PID, KEY, signatures, payer data or balances. */
import { prisma } from "../src/lib/prisma";
import { checkoutMethods, zpayConfig } from "../src/lib/billing/zpay";
async function main() {
  const config = zpayConfig();
  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='payment_order' AND column_name IN ('provider_trade_no','fulfilled_at','idempotency_key','last_checked_at','next_check_at','last_error_code')) OR (table_name='payment_event' AND column_name IN ('order_id','kind','source','code','details','created_at')))`;
  const migrationReady = rows.length === 12;
  const report: Record<string, unknown> = { configured: true, enabled: process.env.ZPAY_ENABLED === "true", methods: config.methods, baseUrl: config.baseUrl, migrationReady, checkoutAvailable: checkoutMethods().length > 0 };
  if (process.argv.includes("--gateway")) {
    const url = new URL("https://zpayz.cn/api.php");
    url.search = new URLSearchParams({ act: "balance", pid: config.pid, key: config.key }).toString();
    try {
      const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      report.gatewayAuthentication = response.ok && data.code === 1;
    } catch { report.gatewayAuthentication = false; }
  }
  console.log(JSON.stringify(report));
  if (!migrationReady || report.gatewayAuthentication === false) process.exitCode = 1;
}
void main().catch(() => { console.error("Billing readiness check failed: verify server configuration and migration"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

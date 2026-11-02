import { prisma } from "../src/lib/prisma";
import { reconcileDueOrders } from "../src/lib/billing/zpayService";
async function main() {
  const raw = process.argv.find(v => v.startsWith("--limit="))?.split("=")[1] ?? "25";
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100) throw new Error("limit must be 1..100");
  const result = await reconcileDueOrders(Number(raw));
  console.log(JSON.stringify({ checked: result.length, results: result }));
  if (result.some(r => r.status === "error" || r.status === "review" || r.code !== "OK")) process.exitCode = 1;
}
void main().catch(() => { console.error("Billing reconciliation failed; check configuration and payment events"); process.exitCode = 1; }).finally(() => prisma.$disconnect());

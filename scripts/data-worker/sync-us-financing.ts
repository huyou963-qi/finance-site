import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { FINANCING_CODES } from "../../src/lib/data/scheduler/usFinancing/catalog";
import { runDataSubscription } from "../../src/lib/data/scheduler/runSubscription";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const prefix = process.argv.find((a) => a.startsWith("--prefix="))?.slice(9) ?? "";
  const codes = FINANCING_CODES.filter((code) => code.startsWith(prefix));
  if (!codes.length) throw new Error("No financing codes match --prefix");
  for (const code of codes) {
    const sub = await prisma.dataSubscription.findFirst({ where: { instrument: { code } },
      include: { source: true, instrument: true, releasePackage: true } });
    if (!sub) throw new Error(`Missing subscription: ${code}; run data:seed-us-financing first`);
    // Use the worker: latest projection, vintage capture, logs, retries and schedule are shared.
    const result = await runDataSubscription(prisma, sub, { force: true, skipCalendarRefresh: true });
    console.log(code, JSON.stringify(result));
    if (result.status !== "success") process.exitCode = 1;
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { repairReviewedPaymentDefinitions } from "../../src/lib/data/scheduler/safeExternal/paymentDefinitions";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
repairReviewedPaymentDefinitions(prisma)
  .then(changed => console.log(`[safe-payments] repaired ${changed} of 69 reviewed definitions; observations and schedules preserved`))
  .catch(() => { console.error("[safe-payments] repair failed; credentials withheld"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

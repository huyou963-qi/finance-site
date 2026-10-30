import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { repairSafeHierarchyDefinitions } from "../../src/lib/data/scheduler/safeExternal/repairHierarchyDefinitions";
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
repairSafeHierarchyDefinitions(prisma).then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error instanceof Error && error.message.startsWith("SAFE 定义修复") ? error.message : "SAFE definition repair failed; credentials withheld"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

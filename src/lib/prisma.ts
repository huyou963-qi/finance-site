import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Next.js 的页面和 Route Handler 可能各自打包此模块；生产也需复用进程级连接池。
globalForPrisma.prisma = prisma;

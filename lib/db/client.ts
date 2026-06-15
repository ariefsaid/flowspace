/**
 * Prisma client singleton.
 *
 * Reuses the instance across hot reloads in development to avoid exhausting
 * the connection pool. Repositories under `lib/db/` should import `prisma`
 * from here. This module is never evaluated during the static build.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client using the node-postgres (pg) driver adapter + Prisma 7 WASM
 * query compiler. The pg adapter is pure JavaScript, so this runs on
 * Windows-on-ARM64 where Prisma's native x64 query engine cannot load, and on
 * Vercel's serverless functions.
 *
 * DATABASE_URL must be a PostgreSQL connection string, e.g.
 *   postgresql://user:password@localhost:5432/solidxpress
 */
function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — point it at your PostgreSQL instance.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

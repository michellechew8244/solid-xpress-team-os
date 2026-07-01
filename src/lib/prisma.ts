import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma client using the better-sqlite3 driver adapter + WASM query compiler.
 * Required on Windows-on-ARM64 where the native x64 query engine DLL cannot
 * load. To move to PostgreSQL, swap this adapter for @prisma/adapter-pg and
 * update DATABASE_URL.
 *
 * Both the CLI (via prisma.config.ts) and this adapter resolve the database to
 * the project-root `dev.db`, so they share one file.
 */
function makeClient() {
  const dbFile = path.join(process.cwd(), "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbFile}` });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

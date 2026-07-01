import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration. The migration engine reads the datasource URL from
 * here. The runtime PrismaClient connects through the pg driver adapter, wired
 * up in src/lib/prisma.ts. DATABASE_URL must be a PostgreSQL connection string.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/solidxpress",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

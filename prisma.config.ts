import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration. The migration / introspection engine reads the
 * datasource URL from here (it is no longer allowed in schema.prisma). The
 * runtime PrismaClient connects through the better-sqlite3 driver adapter,
 * wired up in src/lib/prisma.ts.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Prisma 7 config does not auto-load .env, so read process.env with a dev
    // fallback. The runtime client (src/lib/prisma.ts) resolves the same file.
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

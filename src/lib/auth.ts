import "server-only";
import { cache } from "react";
import { auth } from "./nextauth";
import { prisma } from "./prisma";

/**
 * Session helpers backed by NextAuth (Auth.js v5). The public shape here is
 * unchanged from the previous JWT-cookie implementation, so every call site
 * (getSession / getCurrentUser) keeps working without edits.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
}

/** Read the current NextAuth session and map it to our SessionUser shape.
 * cache()d so repeated calls within one request don't re-parse the session. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user as
    | { id?: string; email?: string | null; name?: string | null; role?: string; departmentId?: string | null }
    | undefined;
  if (!u?.id) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    role: u.role ?? "STAFF",
    departmentId: u.departmentId ?? null,
  };
});

/**
 * Full DB user record for the current session (with department + profile).
 * Wrapped in React cache() so the layout AND the page in the same render share
 * one query instead of hitting the database twice per navigation.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.id },
    include: { department: true, profile: true },
  });
});

// Re-export password helpers so existing imports from "@/lib/auth" keep working.
export { hashPassword, verifyPassword } from "./passwords";

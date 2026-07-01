import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./passwords";

/**
 * NextAuth (Auth.js v5) configuration — Credentials provider (email/password).
 *
 * Uses the JWT session strategy (required for Credentials) so we don't need
 * database Session/Account tables. The user's role + department are carried in
 * the token and exposed on the session for RBAC.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Deactivated / locked accounts cannot sign in (history is preserved).
        if (!user || !user.isActive || user.accessStatus !== "ACTIVE") return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Record the successful login timestamp.
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        // Returned object becomes the JWT `user` on first sign-in.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
        } as { id: string; email: string; name: string; role: string; departmentId: string | null };
      },
    }),
  ],
  callbacks: {
    // Persist role + departmentId into the token.
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.departmentId = (user as { departmentId?: string | null }).departmentId ?? null;
      }
      return token;
    },
    // Expose id/role/departmentId on the session.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { departmentId?: string | null }).departmentId = (token.departmentId as string | null) ?? null;
      }
      return session;
    },
  },
});
